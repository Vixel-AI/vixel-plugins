#!/usr/bin/env node
// Compares each visual's planned line (your saved production_plan beats) with its transcript and names the cheapest fix:
// a trim (Timeline or local edit), a local mute, or a retake with a repair category. Advisory only: it never quotes or spends.
// Usage: node check-lines.mjs --beats plan.json [--project vixel-remotion] [--work work.json] [--shot-keys k1,k2]
// Writes <project>/review/lines.json.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { KitError, parseArgs, isMain, runMain, loadCut, loadCaptions, readJson, beatsFrom, mapVisualsToShots, heardTokens, checkLine, writeFileAtomic } from './lib.mjs';
import { NOT_TRANSCRIBED } from './transcribe.mjs';

export async function checkLines({ project, beats, work = null, shotKeys = null }) {
  const { cut, paths } = await loadCut(project);
  const shots = mapVisualsToShots(cut.visuals, { beats, work, shotKeys });
  const lines = [];
  let transcribed = 0;
  for (const visual of cut.visuals) {
    const shot = shots[visual.index], window = { startMs: visual.sourceStartMs, endMs: visual.sourceStartMs + visual.durationMs };
    const base = { index: visual.index, assetId: visual.assetId, shotKey: shot.shotKey, shotMatch: shot.how };
    if (!shot.beat) { lines.push({ ...base, status: 'unmapped', suggestion: { fix: 'map', note: 'Pass --work (film_v1_project JSON) or --shot-keys so this visual maps to its beat.' } }); continue; }
    const planned = shot.beat.dialogue?.[0]?.text ?? null;
    if (visual.kind !== 'video' || !visual.probe?.hasAudio) {
      lines.push({ ...base, expected: planned, status: visual.kind === 'video' ? 'no-audio' : 'still-image', suggestion: !planned ? { fix: 'none' }
        : visual.kind === 'video' ? { fix: 'retake', repair: 'speech' } : { fix: 'video', note: 'This beat is still a picture, so its planned line is not in the cut.' } });
      continue;
    }
    const captions = await loadCaptions(paths, visual.index);
    if (captions === null) { lines.push({ ...base, expected: planned, status: 'not-transcribed', suggestion: { fix: 'listen' } }); continue; }
    transcribed++;
    lines.push({ ...base, ...checkLine({ beat: shot.beat, heard: heardTokens(captions), window, mediaDurationMs: visual.probe?.durationMs ?? null }) });
  }
  const out = { kind: 'vixel-line-check', scope: 'Local advisory comparison of planned lines and an automatic transcript; it can mishear. Listen before acting.',
    projectId: cut.projectId, revisionId: cut.revisionId, lines };
  await fsp.mkdir(paths.reviewDir, { recursive: true });
  await writeFileAtomic(path.join(paths.reviewDir, 'lines.json'), JSON.stringify(out, null, 2) + '\n');
  const attention = lines.filter(line => line.suggestion?.fix && line.suggestion.fix !== 'none');
  return { ok: !attention.length, review: path.join(paths.reviewDir, 'lines.json'), ...(transcribed ? {} : { message: NOT_TRANSCRIBED }),
    summary: lines.map(line => ({ index: line.index, shotKey: line.shotKey, status: line.status, fix: line.suggestion?.fix, repair: line.suggestion?.repair ?? line.suggestion?.retake?.repair,
      sourceStartMs: line.suggestion?.sourceStartMs, durationMs: line.suggestion?.durationMs })) };
}

if (isMain(import.meta)) runMain(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  if (!flags.beats) throw new KitError('ARGUMENT_MISSING', 'Use --beats <file> with the production_plan body you saved.');
  return checkLines({ project: flags.project || 'vixel-remotion', beats: beatsFrom(await readJson(path.resolve(flags.beats), 'the beats file')),
    work: flags.work ? await readJson(path.resolve(flags.work), 'the Work JSON') : null, shotKeys: flags['shot-keys'] ? flags['shot-keys'].split(',') : null });
});
