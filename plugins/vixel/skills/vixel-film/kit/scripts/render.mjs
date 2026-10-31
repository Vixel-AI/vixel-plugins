#!/usr/bin/env node
// Renders the vixel-film template: Remotion draws the picture (muted), FFmpeg mixes clip sound, Work audio and the music bed
// with the same constants as the preview, then normalizes loudness (-14 LUFS, -1.5 dBTP) and runs local checks.
// Usage: node render.mjs [--project vixel-remotion] [--composition FilmVixel|Film] [--out out/film.mp4] [--stills] [--audio-only]
//   [--delay-timeout-ms 180000] [--render-timeout-min 45] [--concurrency N]
// The MP4 is a local file: not a Vixel export receipt, not a release and not a post.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { KitError, parseArgs, isMain, runMain, loadCut, readJson, requireFfmpeg, ffmpeg, run, probeMedia, decodeErrors, writeFileAtomic, safeSegment,
  TEMPLATE_ENTRY, REMOTION_VERSION, LOUDNESS } from './lib.mjs';

const COMPOSITIONS = ['FilmVixel', 'Film'];

export function pickStillFrames(edit, composition) {
  const total = edit.totals[composition], frames = [];
  const at = (seg, share) => seg && frames.push(Math.floor(seg.from + seg.frames * share));
  at(edit.segments.find(s => s.card === 'title'), 0.6);
  const subs = edit.subtitles;
  if (subs.length) { frames.push(Math.floor((subs[0].from + subs[0].to) / 2)); if (subs.length > 1) frames.push(Math.floor((subs[subs.length - 1].from + subs[subs.length - 1].to) / 2)); }
  const visuals = edit.segments.filter(s => s.visual != null);
  at(visuals[Math.floor(visuals.length / 2)], 0.5);
  at(edit.segments.find(s => s.card === 'end'), 0.7);
  if (composition === 'FilmVixel') at(edit.segments.find(s => s.card === 'brand'), 0.7);
  return [...new Set(frames.filter(f => f >= 0 && f < total))].sort((a, b) => a - b);
}

// FFmpeg inputs and filter graph for the final sound; null when nothing is audible.
export function mixPlan(edit, composition) {
  const total = edit.totals[composition], fps = edit.fps, sec = frames => (frames / fps).toFixed(4);
  const inputs = [], chains = [], labels = [];
  const format = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
  const place = (src, trimBefore, frames, from, volume, fades = '') => {
    const i = inputs.push(src) - 1;
    chains.push(`[${i}:a]atrim=start=${sec(trimBefore)}:duration=${sec(frames)},asetpts=PTS-STARTPTS,${format},volume=${volume}${fades},adelay=delays=${Math.round((from * 1000) / fps)}:all=1[a${i}]`);
    labels.push(`[a${i}]`);
  };
  const fade = (edit.mix.fadeFrames / fps).toFixed(4);
  for (const seg of edit.segments) {
    if (seg.visual == null || !seg.hasAudio || !(seg.volume > 0) || seg.from >= total) continue;
    const frames = Math.min(seg.frames, total - seg.from);
    place(seg.src, seg.trimBefore, frames, seg.from, seg.volume, `${seg.fadeIn ? `,afade=t=in:st=0:d=${fade}` : ''}${seg.fadeOut ? `,afade=t=out:st=${sec(Math.max(0, frames - edit.mix.fadeFrames))}:d=${fade}` : ''}`);
  }
  for (const clip of edit.audio) if (clip.from < total && clip.volume > 0) place(clip.src, clip.trimBefore, Math.min(clip.frames, total - clip.from), clip.from, clip.volume);
  if (edit.music.src) {
    const i = inputs.push(edit.music.src) - 1, k = edit.mix.duckRampFrames / fps;
    const terms = edit.speech.map(s => `clip(min((t-${(s.from / fps - k).toFixed(4)})/${k.toFixed(4)},(${(s.to / fps + k).toFixed(4)}-t)/${k.toFixed(4)}),0,1)`);
    const duck = terms.length ? terms.reduce((a, b) => `max(${a},${b})`) : '0';
    const tail = `clip((${sec(total)}-t)/${edit.mix.musicFadeOutSeconds},0,1)`;
    chains.push(`[${i}:a]${format},atrim=duration=${sec(total)},asetpts=PTS-STARTPTS,volume='(${edit.mix.musicVolume}-${(edit.mix.musicVolume - edit.mix.musicDuckVolume).toFixed(4)}*${duck})*${tail}':eval=frame[a${i}]`);
    labels.push(`[a${i}]`);
  }
  if (!labels.length) return null;
  const join = labels.length > 1 ? `${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest` : `${labels[0]}anull`;
  return { inputs, filter: `${chains.join(';')};${join},apad=whole_dur=${sec(total)},atrim=end=${sec(total)}[mix]`, seconds: total / fps };
}

export function parseLoudnormJson(stderr) {
  const match = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/s);
  if (!match) throw new KitError('LOUDNESS_FAILED', 'FFmpeg loudnorm printed no measurement.');
  return JSON.parse(match[0]);
}

export function parseEbur128(stderr) {
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const num = re => { const m = summary.match(re); return m ? Number(m[1]) : null; };
  return { integratedLufs: num(/I:\s+(-?[\d.]+|-inf) LUFS/), loudnessRangeLu: num(/LRA:\s+(-?[\d.]+) LU/), truePeakDbtp: num(/True peak:\s+Peak:\s+(-?[\d.]+|-inf) dBFS/) };
}

function spawnWithTimeout(command, args, { cwd, timeoutMs, logFile }) {
  return new Promise((resolve, reject) => {
    const log = fs.createWriteStream(logFile, { flags: 'w' });
    const child = spawn(command, args, { cwd, windowsHide: true });
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000).unref(); }, timeoutMs);
    child.on('error', error => { clearTimeout(timer); log.end(); reject(new KitError('RENDER_FAILED', `Cannot start Remotion: ${error.message}`)); });
    child.on('close', code => {
      clearTimeout(timer); log.end();
      if (timedOut) reject(new KitError('RENDER_TIMEOUT', `Remotion did not finish within ${Math.round(timeoutMs / 60000)} min; see ${logFile}. Retry with a larger --render-timeout-min or fewer concurrent renders.`));
      else if (code) reject(new KitError('RENDER_FAILED', `Remotion exited with ${code}; see ${logFile}.`));
      else resolve();
    });
  });
}

async function remotionCli(root) {
  const cli = path.join(root, 'node_modules', '@remotion', 'cli', 'remotion-cli.js');
  if (!fs.existsSync(cli)) throw new KitError('REMOTION_MISSING', `No Remotion CLI in ${root}/node_modules. Run npm install in the project (create-video installs it).`, 3);
  if (!fs.existsSync(path.join(root, TEMPLATE_ENTRY))) throw new KitError('TEMPLATE_MISSING', 'The vixel-film template is not in this project. Run install-template.mjs first.', 3);
  const version = await fsp.readFile(path.join(root, 'node_modules', 'remotion', 'package.json'), 'utf8').then(text => JSON.parse(text).version, () => null);
  return { cli, version, warning: version === REMOTION_VERSION ? null : `The template is tested with Remotion ${REMOTION_VERSION}; this project has ${version}.` };
}

export async function render({ project, composition = 'FilmVixel', out = null, stills = false, audioOnly = false, delayTimeoutMs = 180000, renderTimeoutMin = 45, concurrency = null }) {
  if (!COMPOSITIONS.includes(composition)) throw new KitError('COMPOSITION_INVALID', 'Use --composition FilmVixel or Film.');
  const { cut, paths } = await loadCut(project);
  const edit = await readJson(paths.editJson, 'edit.json (run make-edit.mjs first)');
  if (composition === 'Film' && !edit.cleanExportEntitled) throw new KitError('CLEAN_EXPORT_ENTITLEMENT_REQUIRED', 'This account does not have clean export; render FilmVixel (visible watermark).', 3);
  await requireFfmpeg();
  const remotion = await remotionCli(paths.root), work = path.join(paths.outDir, '.vixel-work');
  await fsp.mkdir(work, { recursive: true });
  const node = process.execPath, timeoutMs = Math.max(1, Number(renderTimeoutMin) || 45) * 60000;
  const bundle = path.join(work, 'bundle');
  const runRemotion = (args, logName) => spawnWithTimeout(node, [remotion.cli, ...args, '--log=error'], { cwd: paths.root, timeoutMs, logFile: path.join(work, logName) });
  const needVideo = stills || !audioOnly;
  if (needVideo) await runRemotion(['bundle', TEMPLATE_ENTRY, '--out-dir', bundle], 'bundle.log');
  if (stills) {
    const dir = path.join(work, `stills-${composition}`);
    await fsp.rm(dir, { recursive: true, force: true }); await fsp.mkdir(dir, { recursive: true });
    const frames = pickStillFrames(edit, composition);
    for (const [i, frame] of frames.entries())
      await runRemotion(['still', bundle, composition, path.join(dir, `${String(i + 1).padStart(3, '0')}.jpg`), `--frame=${frame}`, '--scale=0.5', `--timeout=${delayTimeoutMs}`], 'stills.log');
    const sheet = path.join(paths.outDir, `stills-${composition}.jpg`);
    await ffmpeg(['-v', 'error', '-y', '-i', path.join(dir, '%03d.jpg'), '-vf', `tile=3x${Math.ceil(frames.length / 3)}:padding=6:color=black`, '-frames:v', '1', '-q:v', '3', sheet]);
    return { ok: true, stills: sheet, frames, warning: remotion.warning, next: 'Open the sheet: title, subtitles clear of platform controls, end card, watermark.' };
  }
  const base = safeSegment(edit.title?.text || cut.title || 'film', 'film', 40);
  const output = path.resolve(out || path.join(paths.outDir, `${base}-${composition}.mp4`));
  await fsp.mkdir(path.dirname(output), { recursive: true });
  const video = path.join(work, `${base}-${composition}.video.mp4`);
  if (!audioOnly) await runRemotion(['render', bundle, composition, video, '--muted', '--codec=h264', '--crf=18', `--timeout=${delayTimeoutMs}`,
    ...(concurrency ? [`--concurrency=${concurrency}`] : [])], 'render.log');
  else if (!fs.existsSync(video)) throw new KitError('VIDEO_MISSING', 'No rendered picture yet; run without --audio-only first.');
  const plan = mixPlan(edit, composition), seconds = edit.totals[composition] / edit.fps, mix = path.join(work, `${base}-${composition}.mix.wav`);
  let loudness = { normalized: false };
  if (plan) {
    await ffmpeg(['-v', 'error', '-y', ...plan.inputs.flatMap(src => ['-i', path.join(paths.publicDir, src)]), '-filter_complex', plan.filter, '-map', '[mix]', '-t', seconds.toFixed(4), '-c:a', 'pcm_f32le', mix]);
    const measured = parseLoudnormJson((await run('ffmpeg', ['-hide_banner', '-nostdin', '-i', mix, '-af', `loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}:print_format=json`, '-f', 'null', '-'])).stderr);
    const audible = Number(measured.input_i) > -70;
    const filter = audible ? `loudnorm=I=${LOUDNESS.I}:TP=${LOUDNESS.TP}:LRA=${LOUDNESS.LRA}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=json` : 'anull';
    const muxed = await ffmpeg(['-y', '-i', video, '-i', mix, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-af', filter, '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-t', seconds.toFixed(4), '-movflags', '+faststart', output]);
    loudness = audible ? { normalized: true, mode: parseLoudnormJson(muxed.stderr).normalization_type, measuredInputLufs: Number(measured.input_i) } : { normalized: false, note: 'The mix is silent.' };
  } else {
    await ffmpeg(['-v', 'error', '-y', '-i', video, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-t', seconds.toFixed(4), '-movflags', '+faststart', output]);
    loudness = { normalized: false, note: 'Every clip is muted and there is no music; the film is silent.' };
  }
  const probe = await probeMedia(output), errors = await decodeErrors(output, 'video');
  const meter = parseEbur128((await run('ffmpeg', ['-hide_banner', '-nostats', '-nostdin', '-i', output, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'])).stderr);
  const sheet = output.replace(/\.mp4$/i, '') + '-sheet.jpg';
  await ffmpeg(['-v', 'error', '-y', '-i', output, '-vf', `fps=24/${seconds.toFixed(3)},scale=320:-2,tile=6x4:padding=4:color=black`, '-frames:v', '1', '-q:v', '3', sheet]);
  const durationOk = probe.durationMs != null && Math.abs(probe.durationMs - seconds * 1000) <= 100;
  const qa = { kind: 'vixel-local-render-check', scope: 'Local check of a local render. Not a Vixel export receipt, release or server validation.', composition,
    branded: composition === 'FilmVixel', projectId: cut.projectId, revisionId: cut.revisionId, manifestHash: cut.manifestHash, output, expectedSeconds: seconds,
    durationMs: probe.durationMs, durationOk, decodeErrors: errors, size: `${probe.width}x${probe.height}`, loudness: { target: LOUDNESS, ...loudness, ...meter }, sheet,
    remotionVersion: remotion.version, mutedVisuals: edit.segments.filter(s => s.visual != null && s.volume === 0).map(s => s.visual) };
  await writeFileAtomic(`${output}.qa.json`, JSON.stringify(qa, null, 2) + '\n');
  return { ok: durationOk && !errors, ...qa, warning: remotion.warning,
    next: 'Watch the whole file. Before preparing it as a release (only when the creator asks), read the export manifest again and confirm manifestHash is unchanged.' };
}

if (isMain(import.meta)) runMain(async () => {
  const { flags } = parseArgs(process.argv.slice(2), { bools: ['stills', 'audio-only'] });
  return render({ project: flags.project || 'vixel-remotion', composition: flags.composition || 'FilmVixel', out: flags.out ? path.resolve(flags.out) : null,
    stills: flags.stills === true, audioOnly: flags['audio-only'] === true, delayTimeoutMs: Number(flags['delay-timeout-ms']) || 180000,
    renderTimeoutMin: Number(flags['render-timeout-min']) || 45, concurrency: flags.concurrency ? Number(flags.concurrency) : null });
});
