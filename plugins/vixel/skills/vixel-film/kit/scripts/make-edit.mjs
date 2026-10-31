#!/usr/bin/env node
// Builds <project>/public/cut/edit.json for the vixel-film Remotion template from cut.json, your saved beats and any captions.
// Nothing is hand-filled: timing comes from the manifest, subtitles from the Script lines (timed by the transcript when one exists).
// Usage: node make-edit.mjs [--project vixel-remotion] [--beats plan.json] [--work work.json] [--title "Title"] [--no-title]
//   [--end-line "Line" ...] [--subtitles auto|script|captions|none] [--music auto|none|<track you hold rights to>] [--mood play] [--bpm 100]
//   [--mute 2,3] [--no-brand-card] [--overrides edit-overrides.json]
// Mute, fades, cards and music live only in this local edit; they never change the Work.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { KitError, parseArgs, isMain, runMain, loadCut, loadCaptions, readJson, beatsFrom, mapVisualsToShots, heardTokens, timeScript, planScript,
  chunkTokens, scriptTokens, ffmpeg, probeMedia, requireFfmpeg, writeFileAtomic, MIX, FPS } from './lib.mjs';
import { MOODS, checkBpm, writeBed } from './music.mjs';

export const DEFAULT_COLORS = { cream: '#FFF6E6', ink: '#1B1426', accent: '#FF9A3C', highlight: '#FFD25E' };
export const DEFAULT_BRAND = { card: true, madeWith: 'MADE WITH', name: 'Vixel', tagline: 'Turn your story into an AI short film.', url: 'vixelai.com' };
const HEX = /^#[0-9a-fA-F]{6}$/;

const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
const merge = (base, extra) => { if (!isObject(extra)) return extra === undefined ? base : extra; const out = { ...base }; for (const [k, v] of Object.entries(extra)) out[k] = isObject(base?.[k]) ? merge(base[k], v) : v; return out; };

export function titleRows(title, portrait) {
  const words = String(title || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const budget = portrait ? 12 : 18, rows = [[]];
  for (const word of words) { const row = rows[rows.length - 1]; if (row.length && [...row.join(' '), ' ', ...word].length > budget) rows.push([word]); else row.push(word); }
  return rows;
}

const ms = (frames, fps) => (frames * 1000) / fps;
const windowOf = visual => ({ startMs: visual.sourceStartMs, endMs: visual.sourceStartMs + visual.durationMs });
const inWindow = (token, window) => token.endMs > window.startMs && token.startMs < window.endMs;

// Subtitles and speech spans for one visual segment, in film frames.
export function segmentSubtitles({ segment, visual, beat, captions, mode, portrait, fps = FPS }) {
  const window = windowOf(visual), line = beat?.dialogue?.[0];
  const frameOf = sourceMs => segment.from + Math.round(((sourceMs - visual.sourceStartMs) * fps) / 1000);
  const end = segment.from + segment.frames;
  let tokens = null, source = null;
  if (line && mode !== 'none' && mode !== 'captions') {
    tokens = captions?.length ? timeScript(line.text, heardTokens(captions)) : null;
    source = tokens ? 'captions' : 'planned';
    tokens ||= planScript(line.text, window.startMs, window.endMs);
  } else if (mode === 'captions' && captions?.length) {
    tokens = captions.map((c, i) => ({ ...scriptTokens(c.text)[0], text: c.text.trim(), space: i > 0 && /^\s/.test(c.text), startMs: c.startMs, endMs: c.endMs })).filter(t => t.text);
    source = 'transcript';
  }
  const speech = [];
  const heard = (captions || []).filter(c => inWindow(c, window));
  if (heard.length) {
    let span = null;
    for (const c of heard) { if (span && c.startMs - span.endMs < 400) span.endMs = c.endMs; else speech.push(span = { startMs: c.startMs, endMs: c.endMs }); }
  }
  const visible = (tokens || []).filter(t => inWindow(t, window));
  if (!visible.length) return { chunks: [], speech: speech.map(s => ({ from: Math.max(segment.from, frameOf(s.startMs)), to: Math.min(end, frameOf(s.endMs)) })), source: null };
  if (!heard.length) speech.push({ startMs: visible[0].startMs, endMs: visible[visible.length - 1].endMs });
  const style = line?.delivery === 'voice_over' ? 'voice_over' : line?.delivery === 'sung' ? 'sung' : 'line';
  const chunks = chunkTokens(visible, { portrait }).map(group => ({ style, speaker: line?.speaker ?? null, source,
    words: group.map(t => ({ text: t.text, space: t.space, from: Math.max(segment.from, frameOf(t.startMs)), to: Math.min(end, Math.max(frameOf(t.startMs) + 4, frameOf(t.endMs))) })) }));
  chunks.forEach((chunk, i) => {
    chunk.from = Math.max(segment.from, chunk.words[0].from - 3);
    const next = chunks[i + 1];
    chunk.to = Math.min(end, next ? Math.max(chunk.from + 6, next.words[0].from - 3) : chunk.words[chunk.words.length - 1].to + 20);
  });
  return { chunks: chunks.filter(c => c.to > c.from), speech: speech.map(s => ({ from: Math.max(segment.from, frameOf(s.startMs) - 3), to: Math.min(end, frameOf(s.endMs)) })).filter(s => s.to > s.from), source };
}

export function buildEdit({ cut, shots, captionsByIndex = new Map(), options = {} }) {
  const fps = FPS, width = cut.width, height = cut.height, portrait = height > width, overrides = options.overrides || {};
  const frames = valueMs => Math.round((valueMs * fps) / 1000);
  const title = options.noTitle ? '' : String(overrides.title?.text ?? options.title ?? cut.title ?? '').trim();
  const endLines = (overrides.endLines ?? options.endLines ?? []).map(String).filter(Boolean);
  const brand = merge(DEFAULT_BRAND, { ...(options.brandCard === false ? { card: false } : {}), ...(overrides.brand || {}) });
  const colors = merge(DEFAULT_COLORS, overrides.colors || {});
  for (const [name, value] of Object.entries(colors)) if (!HEX.test(value)) throw new KitError('EDIT_INVALID', `colors.${name} must be a #RRGGBB colour.`);
  const mute = new Set(options.mute || []), mood = MOODS.includes(options.mood) ? options.mood : 'play';
  const segments = [];
  const titleFrames = title ? frames((overrides.title?.seconds ?? 2.5) * 1000) : 0;
  if (titleFrames) segments.push({ id: 'title', card: 'title', from: 0, frames: titleFrames, mood: overrides.title?.mood || null });
  for (const visual of cut.visuals) {
    const from = titleFrames + frames(visual.startMs), to = titleFrames + frames(visual.startMs + visual.durationMs), per = overrides.visuals?.[visual.index] || {};
    const aspect = visual.probe?.width && visual.probe?.height ? visual.probe.width / visual.probe.height : width / height;
    segments.push({ id: `v${String(visual.index).padStart(2, '0')}`, visual: visual.index, shotKey: shots[visual.index]?.shotKey ?? null, src: visual.file, kind: visual.kind,
      from, frames: to - from, trimBefore: frames(visual.sourceStartMs), hasAudio: visual.kind === 'video' && visual.probe?.hasAudio === true,
      volume: mute.has(visual.index) ? 0 : per.volume ?? 1, fadeIn: per.fadeIn === true, fadeOut: per.fadeOut === true,
      fit: per.fit || (Math.abs(aspect - width / height) / (width / height) < 0.03 ? 'cover' : 'contain'), mood: MOODS.includes(per.mood) ? per.mood : null });
  }
  const cutEnd = titleFrames + frames(cut.durationMs);
  let cursor = cutEnd;
  if (endLines.length) { const n = frames((overrides.endSeconds ?? 3.5) * 1000); segments.push({ id: 'end', card: 'end', from: cursor, frames: n, mood: overrides.endMood || null }); cursor += n; }
  const cleanFrames = cursor;
  if (brand.card) { const n = frames(3.5 * 1000); segments.push({ id: 'brand', card: 'brand', from: cursor, frames: n, mood: overrides.endMood || null }); cursor += n; }
  const visualMoods = segments.filter(s => s.visual != null).map(s => s.mood || mood);
  for (const s of segments) if (!s.mood) s.mood = s.card === 'title' ? visualMoods[0] || mood : s.card ? visualMoods[visualMoods.length - 1] || mood : mood;
  const subtitles = [], speech = [], sources = new Set();
  for (const segment of segments.filter(s => s.visual != null && s.kind === 'video')) {
    const visual = cut.visuals[segment.visual];
    const result = segmentSubtitles({ segment, visual, beat: shots[visual.index]?.beat, captions: captionsByIndex.get(visual.index) || null, mode: options.subtitles || 'auto', portrait, fps });
    subtitles.push(...result.chunks); speech.push(...result.speech); if (result.source) sources.add(result.source);
  }
  const audio = (cut.audio || []).map(clip => ({ src: clip.file, from: titleFrames + frames(clip.startMs), frames: frames(clip.startMs + clip.durationMs) - frames(clip.startMs), trimBefore: frames(clip.sourceStartMs), volume: clip.volume ?? 1 }));
  const sections = [];
  for (const s of segments) if (!sections.length || sections[sections.length - 1].mood !== s.mood) sections.push({ startSeconds: Math.round(ms(s.from, fps)) / 1000, mood: s.mood });
  return {
    kind: 'vixel-edit', version: 1, note: 'Local creative edit for the vixel-film Remotion template. It never changes the Work.',
    projectId: cut.projectId, revisionId: cut.revisionId, manifestHash: cut.manifestHash, fps, width, height, portrait, cleanExportEntitled: cut.cleanExportEntitled === true,
    colors, title: title ? { text: title, rows: overrides.title?.rows ?? titleRows(title, portrait), accent: overrides.title?.accent ?? [], still: 'cut/stills/title.jpg' } : null,
    endLines, endStill: 'cut/stills/end.jpg', brand, segments, audio, subtitles, subtitleSources: [...sources], speech: speech.sort((a, b) => a.from - b.from),
    music: { src: null, kind: 'none', sections, transpose: Number(overrides.music?.transpose ?? options.transpose ?? 0) || 0,
      bpm: checkBpm(overrides.music?.bpm ?? options.bpm) }, mix: { ...MIX, ...(overrides.mix || {}) },
    totals: { Film: cleanFrames, FilmVixel: cursor, cut: cutEnd - titleFrames },
  };
}

async function still(input, kind, atMs, width, height, output) {
  await ffmpeg(['-v', 'error', '-y', ...(kind === 'image' ? [] : ['-ss', (Math.max(0, atMs) / 1000).toFixed(3)]), '-i', input, '-frames:v', '1',
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`, '-q:v', '2', output]);
}

export async function makeEdit({ project, beats = [], work = null, shotKeys = null, ...options }) {
  const { cut, paths } = await loadCut(project);
  await requireFfmpeg();
  const shots = mapVisualsToShots(cut.visuals, { beats, work, shotKeys });
  const captionsByIndex = new Map();
  for (const visual of cut.visuals) { const captions = await loadCaptions(paths, visual.index); if (captions) captionsByIndex.set(visual.index, captions); }
  const edit = buildEdit({ cut, shots, captionsByIndex, options });
  const stills = path.join(paths.cutDir, 'stills');
  await fsp.mkdir(stills, { recursive: true });
  const first = cut.visuals[0], last = cut.visuals[cut.visuals.length - 1];
  await still(path.join(paths.publicDir, first.file), first.kind, first.sourceStartMs + Math.min(500, first.durationMs / 2), edit.width, edit.height, path.join(stills, 'title.jpg'));
  await still(path.join(paths.publicDir, last.file), last.kind, last.sourceStartMs + last.durationMs - 100, edit.width, edit.height, path.join(stills, 'end.jpg'));
  const music = options.music || 'auto';
  if (music === 'auto') {
    await writeBed(path.join(paths.cutDir, 'music.wav'), { sections: edit.music.sections, totalSeconds: edit.totals.FilmVixel / edit.fps, transpose: edit.music.transpose, bpm: edit.music.bpm });
    Object.assign(edit.music, { src: 'cut/music.wav', kind: 'generated' });
  } else if (music !== 'none') {
    const source = path.resolve(music), probe = await probeMedia(source);
    if (!probe.hasAudio) throw new KitError('MUSIC_INVALID', 'The music file has no audio stream.');
    const name = `music-track${path.extname(source).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.audio'}`;
    await fsp.copyFile(source, path.join(paths.cutDir, name));
    Object.assign(edit.music, { src: `cut/${name}`, kind: 'creator', note: 'Creator-supplied track; the creator confirmed they hold the rights.' });
  }
  await writeFileAtomic(paths.editJson, JSON.stringify(edit, null, 2) + '\n');
  return { ok: true, edit: paths.editJson, seconds: { Film: edit.totals.Film / edit.fps, FilmVixel: edit.totals.FilmVixel / edit.fps }, subtitles: edit.subtitles.length,
    subtitleSources: edit.subtitleSources, music: edit.music.kind, cleanAvailable: edit.cleanExportEntitled,
    next: 'Preview with `npx remotion studio src/vixel-film/index.ts` in the project, then run render.mjs --stills and render.mjs.' };
}

if (isMain(import.meta)) runMain(async () => {
  const { flags } = parseArgs(process.argv.slice(2), { bools: ['no-title', 'no-brand-card'], multi: ['end-line'] });
  const list = value => (value ? String(value).split(',').map(v => v.trim()).filter(Boolean) : null);
  return makeEdit({ project: flags.project || 'vixel-remotion', beats: flags.beats ? beatsFrom(await readJson(path.resolve(flags.beats), 'the beats file')) : [],
    work: flags.work ? await readJson(path.resolve(flags.work), 'the Work JSON') : null, shotKeys: list(flags['shot-keys']),
    title: flags.title, noTitle: flags['no-title'] === true, endLines: flags['end-line'] || [], subtitles: flags.subtitles || 'auto', music: flags.music || 'auto',
    mood: flags.mood, transpose: flags.transpose, bpm: flags.bpm, mute: (list(flags.mute) || []).map(Number), brandCard: flags['no-brand-card'] === true ? false : undefined,
    overrides: flags.overrides ? await readJson(path.resolve(flags.overrides), 'the overrides file') : {} });
});
