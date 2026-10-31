#!/usr/bin/env node
// Word-level transcript of each visual's used window (plus 0.5 s either side) with faster-whisper, if installed.
// Writes Remotion Caption[] per visual to <project>/public/cut/captions/NN.json, in source-file milliseconds.
// Usage: node transcribe.mjs [--project vixel-remotion] [--language en|auto|<code>] [--beats plan.json] [--model small] [--python <python>]
// Python: --python if given, else the kit venv from install-transcription.mjs, else python3/python (Windows: python/py).
// Without faster-whisper it exits 0 and says so: then listen to every clip and report what you hear.
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KitError, parseArgs, isMain, runMain, loadCut, requireFfmpeg, ffmpeg, run, readJson, beatsFrom, userCacheDir, isCjk, writeFileAtomic, pythonCandidates } from './lib.mjs';

export const NOT_TRANSCRIBED = 'Not transcribed: faster-whisper is not installed. Listen to every clip and report what you hear; do not present the words as checked.';
export const MARGIN_MS = 500;

export const chooseModel = language => (language === 'en' ? 'small.en' : 'small');

// Language from the planned lines: kana -> ja, Hangul -> ko, Han -> zh, plain ASCII -> en, otherwise auto-detect.
export function guessLanguage(beats) {
  const text = beats.flatMap(beat => (beat.dialogue || []).map(line => line.text)).join(' ');
  if (!text.trim()) return 'auto';
  if (/[\p{sc=Hiragana}\p{sc=Katakana}]/u.test(text)) return 'ja';
  if (/\p{sc=Hangul}/u.test(text)) return 'ko';
  if (isCjk(text)) return 'zh';
  return /^[\x20-\x7E‘’“”—…]*$/.test(text) ? 'en' : 'auto';
}

export function wordsToCaptions(words, offsetMs) {
  return (words || []).filter(w => typeof w?.w === 'string' && w.w.trim() && Number.isFinite(w.s) && Number.isFinite(w.e)).map(w => {
    const startMs = Math.round(offsetMs + w.s * 1000), endMs = Math.max(startMs, Math.round(offsetMs + w.e * 1000));
    return { text: w.w, startMs, endMs, timestampMs: Math.round((startMs + endMs) / 2), confidence: Number.isFinite(w.p) ? w.p : null };
  });
}

export function parseTranscriberOutput(stdout) {
  try { const value = JSON.parse(stdout); if (value && typeof value === 'object' && !Array.isArray(value)) return value; } catch {}
  throw new KitError('TRANSCRIBE_FAILED', 'The transcriber printed no JSON result.');
}

// -I keeps the working folder and user site-packages out; a virtual environment still sees its own site-packages.
export async function hasFasterWhisper(python) {
  return (await run(python, ['-I', '-c', 'import faster_whisper'], { timeout: 60000 })).code === 0;
}

export async function findTranscriber(candidates) {
  for (const python of candidates) if (await hasFasterWhisper(python)) return python;
  return null;
}

const INSTALLER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'install-transcription.mjs');
export const installCommand = () => `node "${INSTALLER}"`;

export async function transcribe({ project, language = null, beats = [], model = null, python = null, home = os.homedir() }) {
  const { cut, paths } = await loadCut(project);
  const candidates = pythonCandidates({ python, home }), interpreter = await findTranscriber(candidates);
  if (!interpreter) return { ok: true, transcribed: false, message: NOT_TRANSCRIBED, looked: candidates, optionalInstall: installCommand(),
    note: 'The install puts faster-whisper in its own virtual environment (no sudo), which this script uses when run without --python. The first transcription then downloads the speech model, about 500 MB.' };
  await requireFfmpeg();
  const lang = language || guessLanguage(beats), modelName = model || chooseModel(lang), cache = path.join(userCacheDir(), 'whisper');
  await fsp.mkdir(cache, { recursive: true });
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'vixel-kit-words-'));
  try {
    const jobs = [];
    for (const visual of cut.visuals) {
      if (visual.kind !== 'video' || !visual.probe?.hasAudio) continue;
      const startMs = Math.max(0, visual.sourceStartMs - MARGIN_MS);
      const endMs = Math.min(visual.probe.durationMs ?? Infinity, visual.sourceStartMs + visual.durationMs + MARGIN_MS);
      const wav = path.join(temp, `${String(visual.index).padStart(2, '0')}.wav`);
      await ffmpeg(['-v', 'error', '-y', '-ss', (startMs / 1000).toFixed(3), '-t', ((endMs - startMs) / 1000).toFixed(3), '-i', path.join(paths.publicDir, visual.file),
        '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);
      jobs.push({ visual, wav, startMs });
    }
    if (!jobs.length) return { ok: true, transcribed: false, message: 'No visual has an audio track; nothing to transcribe.' };
    const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'transcribe.py');
    console.error(`transcribing ${jobs.length} clip(s) with ${modelName}; the first run downloads the model into ${cache}`);
    const result = await run(interpreter, ['-I', script, modelName, lang, cache, ...jobs.map(job => job.wav)], { timeout: 45 * 60000, maxBuffer: 64 * 1024 * 1024 });
    if (result.code) throw new KitError('TRANSCRIBE_FAILED', `faster-whisper failed: ${result.stderr.trim().split('\n').slice(-2).join(' | ')}`);
    const output = parseTranscriberOutput(result.stdout);
    await fsp.mkdir(paths.captionsDir, { recursive: true });
    const visuals = [];
    for (const job of jobs) {
      const captions = wordsToCaptions(output[job.wav]?.words, job.startMs), name = `${String(job.visual.index).padStart(2, '0')}.json`;
      await writeFileAtomic(path.join(paths.captionsDir, name), JSON.stringify(captions, null, 1) + '\n');
      visuals.push({ index: job.visual.index, file: `cut/captions/${name}`, words: captions.length, language: output[job.wav]?.language ?? null,
        text: captions.map(c => c.text).join('').trim() });
    }
    const index = { kind: 'vixel-captions', timebase: 'source-file-ms', engine: 'faster-whisper', model: modelName, language: lang,
      scope: 'Automatic transcript for local checks and subtitle timing; it can mishear and is not Vixel verification.', visuals };
    await writeFileAtomic(path.join(paths.captionsDir, 'index.json'), JSON.stringify(index, null, 2) + '\n');
    return { ok: true, transcribed: true, python: interpreter, model: modelName, language: lang, visuals, next: 'Run check-lines.mjs with your saved production plan.' };
  } finally { await fsp.rm(temp, { recursive: true, force: true }); }
}

if (isMain(import.meta)) runMain(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  return transcribe({ project: flags.project || 'vixel-remotion', language: flags.language || null, model: flags.model || null, python: flags.python || null,
    beats: flags.beats ? beatsFrom(await readJson(path.resolve(flags.beats), 'the beats file')) : [] });
});
