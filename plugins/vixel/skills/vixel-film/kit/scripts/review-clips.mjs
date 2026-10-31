#!/usr/bin/env node
// Per-visual picture check of the fetched cut: decode errors, real vs planned length, an 8-frame contact sheet of the
// used window, a strip of any trimmed-away head/tail, and the rhythm of the main motion (for beat-cut edits).
// Writes <project>/review/NN-<shot>.jpg and review/clips.json.
// Usage: node review-clips.mjs [--project vixel-remotion] [--beats plan.json] [--work work.json] [--shot-keys k1,k2]
// Open every sheet yourself; this tool does not judge identity, framing or acting.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, isMain, runMain, loadCut, requireFfmpeg, decodeErrors, ffmpeg, readJson, beatsFrom, mapVisualsToShots, safeSegment, writeFileAtomic, motionRhythm } from './lib.mjs';

const RHYTHM_FPS = 24;

// Small grayscale frames of the used window, measured for the rhythm of the main motion.
async function rhythm(input, startMs, durationMs, portrait, scratch) {
  const [width, height] = portrait ? [72, 128] : [128, 72];
  await ffmpeg(['-v', 'error', '-y', '-ss', (startMs / 1000).toFixed(3), '-t', (Math.max(40, durationMs) / 1000).toFixed(3), '-i', input,
    '-vf', `fps=${RHYTHM_FPS},scale=${width}:${height},format=gray`, '-f', 'rawvideo', scratch]);
  try { return motionRhythm(await fsp.readFile(scratch), width, height, RHYTHM_FPS); } finally { await fsp.rm(scratch, { force: true }); }
}

// Tiles that keep each frame's own aspect: one row for portrait, 4x2 for landscape or square.
export function sheetLayout(width, height, frames = 8) {
  const portrait = height > width * 1.05;
  return portrait ? { columns: frames, rows: 1, tileWidth: 216 } : { columns: Math.min(4, frames), rows: Math.ceil(frames / Math.min(4, frames)), tileWidth: 448 };
}

async function sheet(input, startMs, durationMs, frames, layout, output) {
  const seconds = Math.max(0.04, durationMs / 1000);
  await ffmpeg(['-v', 'error', '-y', '-ss', (startMs / 1000).toFixed(3), '-t', seconds.toFixed(3), '-i', input,
    '-vf', `fps=${frames}/${seconds.toFixed(3)},scale=${layout.tileWidth}:-2,tile=${layout.columns}x${layout.rows}:padding=4:color=black`, '-frames:v', '1', '-q:v', '3', output]);
}

export async function reviewClips({ project, beats = [], work = null, shotKeys = null }) {
  const { cut, paths } = await loadCut(project);
  await requireFfmpeg();
  await fsp.mkdir(paths.reviewDir, { recursive: true });
  const shots = mapVisualsToShots(cut.visuals, { beats, work, shotKeys });
  const clips = [];
  for (const visual of cut.visuals) {
    const input = path.join(paths.publicDir, visual.file), probe = visual.probe, shot = shots[visual.index];
    const label = `${String(visual.index).padStart(2, '0')}-${safeSegment(shot.shotKey || visual.assetId.slice(0, 8), 'clip', 40)}`;
    const errors = await decodeErrors(input, visual.kind);
    const layout = sheetLayout(probe.width || 16, probe.height || 9);
    const sheetFile = path.join(paths.reviewDir, `${label}.jpg`);
    const entry = { index: visual.index, assetId: visual.assetId, kind: visual.kind, shotKey: shot.shotKey, shotMatch: shot.how, file: visual.file, decodeErrors: errors,
      plannedMs: visual.durationMs, sourceStartMs: visual.sourceStartMs, sheet: path.relative(paths.root, sheetFile) };
    if (visual.kind === 'image') {
      await ffmpeg(['-v', 'error', '-y', '-i', input, '-vf', `scale=${layout.tileWidth * 2}:-2`, '-frames:v', '1', '-q:v', '3', sheetFile]);
      clips.push({ ...entry, note: 'Still image: it holds for the whole beat.' });
      continue;
    }
    const actual = probe.durationMs, end = visual.sourceStartMs + visual.durationMs;
    Object.assign(entry, { actualMs: actual, unusedHeadMs: visual.sourceStartMs, unusedTailMs: actual == null ? null : Math.max(0, actual - end),
      shortByMs: actual == null ? null : Math.max(0, end - actual), hasAudio: probe.hasAudio });
    const usedMs = Math.min(visual.durationMs, Math.max(40, (actual ?? end) - visual.sourceStartMs));
    if (!errors) {
      await sheet(input, visual.sourceStartMs, usedMs, 8, layout, sheetFile);
      entry.motion = await rhythm(input, visual.sourceStartMs, usedMs, layout.rows === 1, path.join(paths.reviewDir, `.${label}.gray`));
    } else entry.sheet = null;
    const strips = [];
    for (const [side, from, length] of [['head', 0, visual.sourceStartMs], ['tail', end, actual == null ? 0 : actual - end]]) {
      if (errors || length < 200) continue;
      const file = path.join(paths.reviewDir, `${label}-${side}.jpg`);
      await sheet(input, from, length, 4, { ...sheetLayout(probe.width || 16, probe.height || 9, 4), tileWidth: 224 }, file);
      strips.push(path.relative(paths.root, file));
    }
    clips.push({ ...entry, trimmedStrips: strips });
  }
  const problems = clips.filter(c => c.decodeErrors || c.shortByMs > 50).map(c => ({ index: c.index, decodeErrors: c.decodeErrors, shortByMs: c.shortByMs }));
  const out = { kind: 'vixel-clip-review', scope: 'Local picture aid only. Look at every sheet; it is not Vixel quality review.', projectId: cut.projectId, revisionId: cut.revisionId, clips };
  await writeFileAtomic(path.join(paths.reviewDir, 'clips.json'), JSON.stringify(out, null, 2) + '\n');
  const rhythms = clips.filter(c => c.motion).map(c => ({ index: c.index, shotKey: c.shotKey, clear: c.motion.clear, bpm: c.motion.bpm, amplitudePercent: c.motion.amplitudePercent }));
  return { ok: !problems.length, review: path.join(paths.reviewDir, 'clips.json'), sheets: clips.map(c => c.sheet).filter(Boolean), problems, rhythms,
    next: 'Open every sheet and strip against the Picture checklist; then run transcribe.mjs. For a beat-cut, set make-edit --bpm from a clear rhythm (or its double or half) and cut on that clip\'s hitsMs; retake a clip whose motion should be rhythmic but is not.' };
}

if (isMain(import.meta)) runMain(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  return reviewClips({ project: flags.project || 'vixel-remotion', beats: flags.beats ? beatsFrom(await readJson(path.resolve(flags.beats), 'the beats file')) : [],
    work: flags.work ? await readJson(path.resolve(flags.work), 'the Work JSON') : null, shotKeys: flags['shot-keys'] ? flags['shot-keys'].split(',') : null });
});
