#!/usr/bin/env node
// Downloads the accepted cut of a film-cut-v1 export manifest into <project>/public/cut/ and writes cut.json.
// Usage: node fetch-cut.mjs --manifest manifest.json [--project vixel-remotion] [--accept-issues] [--timeout-ms 300000]
// Every file is checked against the manifest sha256 and byteSize, decoded once with FFmpeg, then renamed into place.
// A rerun skips files that already verify. cut.json is a local snapshot, not an export receipt.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { KitError, parseArgs, isMain, runMain, readJson, unwrapManifest, validateManifest, assetFileName, insideDir, sha256File,
  downloadVerified, withRetry, requireFfmpeg, decodeErrors, probeMedia, projectPaths, writeFileAtomic, shotIdFromKey, CUT_DIR } from './lib.mjs';

const exists = file => fsp.lstat(file).then(stat => stat, e => { if (e.code === 'ENOENT') return null; throw e; });

export async function fetchCut({ manifest: raw, project, acceptIssues = false, timeoutMs = 300000, log = () => {} }) {
  const manifest = unwrapManifest(raw);
  const { issues } = validateManifest(manifest, { acceptIssues });
  const paths = projectPaths(project);
  if (!(await exists(paths.root))?.isDirectory()) throw new KitError('PROJECT_MISSING', `${paths.root} is not a folder. Create the Remotion project first.`);
  await fsp.mkdir(paths.cutDir, { recursive: true });
  if ((await fsp.lstat(paths.cutDir)).isSymbolicLink()) throw new KitError('PATH_UNSAFE', 'public/cut must be a real folder.');
  const previous = await fsp.readFile(paths.cutJson, 'utf8').then(JSON.parse, () => null);
  if (previous?.projectId && previous.projectId !== manifest.projectId)
    throw new KitError('CUT_BELONGS_TO_OTHER_WORK', `public/cut holds Work ${previous.projectId}. Move that folder aside (for example to public/cut-${String(previous.projectId).slice(0, 8)}) and run again.`, 2);
  await requireFfmpeg();
  const files = new Map(), report = [], unavailable = [];
  for (const [index, asset] of manifest.assets.entries()) {
    const name = assetFileName(index, asset), file = path.join(paths.cutDir, name);
    if (!insideDir(paths.cutDir, file)) throw new KitError('PATH_UNSAFE', 'Unsafe asset file name.');
    const current = await exists(file);
    if (current && !current.isFile()) throw new KitError('PATH_UNSAFE', `${file} is not a regular file.`);
    if (current?.size === asset.byteSize && await sha256File(file) === asset.sha256) { files.set(asset.id, name); report.push({ id: asset.id, file: name, status: 'verified-cached' }); continue; }
    if (!asset.url) {
      unavailable.push({ id: asset.id, file: name, command: `vixel assets download --project ${manifest.projectId} --id ${asset.id} --output ${file}` });
      continue;
    }
    const part = `${file}.part`;
    log(`downloading ${name}`);
    await withRetry(() => downloadVerified(asset.url, part, { sha256: asset.sha256, byteSize: asset.byteSize, timeoutMs }));
    const errors = await decodeErrors(part, asset.kind);
    if (errors) { await fsp.rm(part, { force: true }); throw new KitError('ASSET_DECODE_FAILED', `${name} matches its sha256 but FFmpeg reported ${errors} decode error(s). Report it; do not render from it.`); }
    await fsp.rename(part, file);
    files.set(asset.id, name);
    report.push({ id: asset.id, file: name, status: 'downloaded' });
  }
  if (unavailable.length) throw new KitError('ASSET_URL_MISSING', 'Some assets have no download url. Run each command (Vixel CLI), then run fetch-cut again; it verifies the files.', 2, { unavailable });
  const probes = new Map();
  for (const [id, name] of files) probes.set(id, await probeMedia(path.join(paths.cutDir, name)));
  const assetById = new Map(manifest.assets.map(asset => [asset.id, asset]));
  const local = clip => {
    const probe = probes.get(clip.assetId), asset = assetById.get(clip.assetId);
    const tooShort = clip.kind !== 'image' && asset.kind !== 'image' && probe.durationMs != null && clip.sourceStartMs + clip.durationMs > probe.durationMs + 50;
    return { ...clip, kind: clip.kind || asset.kind, file: `${CUT_DIR}/${files.get(clip.assetId)}`, probe, ...(tooShort ? { warning: 'SOURCE_TOO_SHORT' } : {}) };
  };
  const [width, height] = manifest.aspectRatio === '9:16' ? [1080, 1920] : manifest.aspectRatio === '1:1' ? [1080, 1080] : [1920, 1080];
  const cut = {
    kind: 'vixel-cut-local-snapshot', note: 'Local finishing snapshot of an export manifest. Not an export receipt, not a release, and it changes no Work.',
    contractVersion: manifest.contractVersion, manifestHash: manifest.manifestHash ?? null, projectId: manifest.projectId, revisionId: manifest.revisionId, writeVersion: manifest.writeVersion,
    title: manifest.title ?? '', aspectRatio: manifest.aspectRatio, width, height, durationMs: manifest.durationMs, cleanExportEntitled: manifest.cleanExportEntitled === true,
    containsStills: manifest.containsStills === true, issues, acceptedIssues: issues.length > 0,
    visuals: manifest.visuals.map((clip, index) => ({ index, ...local(clip), shotId: shotIdFromKey(clip.key) })),
    audio: (manifest.audio || []).map((clip, index) => ({ index, ...local(clip) })),
    assets: manifest.assets.map(asset => ({ id: asset.id, kind: asset.kind, sha256: asset.sha256, byteSize: asset.byteSize, file: `${CUT_DIR}/${files.get(asset.id)}` })),
  };
  await writeFileAtomic(paths.cutJson, JSON.stringify(cut, null, 2) + '\n');
  const warnings = [...cut.visuals, ...cut.audio].filter(clip => clip.warning).map(clip => ({ index: clip.index, assetId: clip.assetId, warning: clip.warning }));
  return { ok: true, cutJson: paths.cutJson, projectId: cut.projectId, revisionId: cut.revisionId, visuals: cut.visuals.length, audio: cut.audio.length, files: report, warnings,
    next: 'Run review-clips.mjs, then transcribe.mjs and check-lines.mjs.' };
}

if (isMain(import.meta)) runMain(async () => {
  const { flags } = parseArgs(process.argv.slice(2), { bools: ['accept-issues'] });
  if (!flags.manifest) throw new KitError('ARGUMENT_MISSING', 'Use --manifest <file> with the saved export manifest JSON.');
  return fetchCut({ manifest: await readJson(path.resolve(flags.manifest), 'the manifest'), project: flags.project || 'vixel-remotion',
    acceptIssues: flags['accept-issues'] === true, timeoutMs: Number(flags['timeout-ms']) || 300000, log: message => console.error(message) });
});
