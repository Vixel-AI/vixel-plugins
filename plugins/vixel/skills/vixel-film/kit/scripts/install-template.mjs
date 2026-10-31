#!/usr/bin/env node
// Adds the vixel-film template (src/vixel-film/, public/vixel-film/) to an existing Remotion project, such as the one
// `npx --yes create-video@4.0.539 --yes --blank vixel-remotion` makes. Writes only missing files; identical files are
// left alone; if any file differs it writes nothing and lists the conflicts, so your edits are never overwritten.
// Usage: node install-template.mjs [vixel-remotion] [--check]
import fsp from 'node:fs/promises';
import path from 'node:path';
import { KitError, parseArgs, isMain, runMain, kitRoot, listKitFiles, REMOTION_VERSION, TEMPLATE_ENTRY } from './lib.mjs';

export const templateFiles = (root = kitRoot()) => listKitFiles(root).filter(file => file.path.startsWith('edit-template/'))
  .map(file => ({ path: file.path.slice('edit-template/'.length), bytes: Buffer.from(file.data, file.encoding) }));

// Plans an overlay: {write, same, conflicts}. Symlinks and non-files count as conflicts.
export async function planOverlay(projectRoot, files) {
  const plan = { write: [], same: [], conflicts: [] };
  for (const file of files) {
    const target = path.join(projectRoot, ...file.path.split('/'));
    let stat = null;
    try { stat = await fsp.lstat(target); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (!stat) plan.write.push(file);
    else if (!stat.isFile()) plan.conflicts.push(file.path);
    else if (Buffer.compare(await fsp.readFile(target), file.bytes)) plan.conflicts.push(file.path);
    else plan.same.push(file.path);
  }
  return plan;
}

async function realDirectory(root, relative) {
  let current = root;
  for (const part of relative.split('/').slice(0, -1)) {
    current = path.join(current, part);
    try { if (!(await fsp.lstat(current)).isDirectory()) throw new KitError('PATH_UNSAFE', `${current} is not a real folder.`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; await fsp.mkdir(current); }
  }
}

export async function installTemplate({ project = 'vixel-remotion', check = false, files = templateFiles() }) {
  const root = path.resolve(project);
  const pkg = await fsp.readFile(path.join(root, 'package.json'), 'utf8').then(JSON.parse, () => null);
  if (!pkg?.dependencies?.remotion) throw new KitError('PROJECT_NOT_REMOTION', `${root} is not a Remotion project. Create it with npx --yes create-video@${REMOTION_VERSION} --yes --blank vixel-remotion.`, 2);
  const plan = await planOverlay(root, files);
  const result = { project: root, entry: TEMPLATE_ENTRY, written: plan.write.map(f => f.path), unchanged: plan.same, conflicts: plan.conflicts,
    remotion: pkg.dependencies.remotion, ...(String(pkg.dependencies.remotion).replace(/^[\^~]/, '') === REMOTION_VERSION ? {} : { warning: `The template is tested with Remotion ${REMOTION_VERSION}.` }) };
  if (plan.conflicts.length) throw new KitError('TEMPLATE_CONFLICT', 'Some template files differ from this kit; nothing was written. Review or move them, then run again.', 2, result);
  if (check) return { ok: true, check: true, ...result, written: [], missing: result.written };
  for (const file of plan.write) {
    await realDirectory(root, file.path);
    await fsp.writeFile(path.join(root, ...file.path.split('/')), file.bytes, { flag: 'wx', mode: 0o644 });
  }
  return { ok: true, ...result, next: `Preview with npx remotion studio ${TEMPLATE_ENTRY} inside the project after make-edit.mjs.` };
}

if (isMain(import.meta)) runMain(async () => {
  const { flags, rest } = parseArgs(process.argv.slice(2), { bools: ['check'] });
  return installTemplate({ project: rest[0] || flags.project || 'vixel-remotion', check: flags.check === true });
});
