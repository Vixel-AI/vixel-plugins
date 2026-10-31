// Shared helpers for the Vixel finishing kit. Node 22+, no dependencies; FFmpeg/FFprobe on PATH.
// Pure functions are exported for tests; scripts import them by relative path.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CUT_CONTRACT = 'film-cut-v1';
export const MAX_ASSET_BYTES = 128 * 1024 * 1024;
export const USER_AGENT = 'vixel-film-kit/1 (+https://vixelai.com)';
export const FPS = 30;
export const CUT_DIR = 'cut';
export const TEMPLATE_ENTRY = 'src/vixel-film/index.ts';
export const REMOTION_VERSION = '4.0.539';
// Mirrors the platform mix: music under dialogue 0.14, otherwise 0.28.
export const MIX = { fadeFrames: 12, duckRampFrames: 6, musicVolume: 0.28, musicDuckVolume: 0.14, musicFadeOutSeconds: 1 };
export const LOUDNESS = { I: -14, TP: -1.5, LRA: 11 };

export class KitError extends Error {
  constructor(code, message, exitCode = 1, details) { super(message); this.code = code; this.exitCode = exitCode; this.details = details; }
}

export function parseArgs(argv, { bools = [], multi = [] } = {}) {
  const flags = {}, rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { rest.push(arg); continue; }
    const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
    const value = bools.includes(name) ? (inline ?? true) : inline ?? argv[++i];
    if (value === undefined) throw new KitError('ARGUMENT_MISSING', `--${name} needs a value.`);
    if (multi.includes(name)) (flags[name] ||= []).push(value); else flags[name] = value;
  }
  return { flags, rest };
}

export function isMain(meta) {
  try { return Boolean(process.argv[1]) && meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href; } catch { return false; }
}

export async function runMain(fn) {
  try { const out = await fn(); if (out !== undefined) console.log(JSON.stringify(out, null, 2)); }
  catch (e) {
    const known = e instanceof KitError;
    console.error(JSON.stringify({ ok: false, error: { code: known ? e.code : 'KIT_ERROR', message: e.message, ...(e.details ? { details: e.details } : {}) } }, null, 2));
    process.exitCode = known ? e.exitCode : 1;
  }
}

// ------------------------------------------------------------------ files and names

export const safeSegment = (value, fallback = 'item', max = 48) =>
  String(value ?? '').normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '') || fallback;

export function insideDir(root, file) {
  const rel = path.relative(path.resolve(root), path.resolve(file));
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

const EXTENSIONS = { video: ['mp4', 'mov', 'webm', 'm4v'], image: ['png', 'jpg', 'jpeg', 'webp'], audio: ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac'] };
export function assetFileName(index, asset) {
  let ext = null;
  try { ext = new URL(asset.url).pathname.match(/\.([a-z0-9]{2,4})$/i)?.[1]?.toLowerCase() ?? null; } catch {}
  if (!EXTENSIONS[asset.kind]?.includes(ext)) ext = { video: 'mp4', image: 'png', audio: 'm4a' }[asset.kind] || 'bin';
  return `${String(index).padStart(2, '0')}-${safeSegment(asset.id, 'asset', 64).slice(0, 8)}.${ext}`;
}

export async function writeFileAtomic(file, data) {
  const temp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(temp, data);
  await fsp.rename(temp, file);
}

export async function readJson(file, what = 'JSON') {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); }
  catch (e) { throw new KitError(e.code === 'ENOENT' ? 'FILE_MISSING' : 'JSON_INVALID', `Cannot read ${what} at ${file}.`); }
}

export async function sha256File(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export function userCacheDir(env = process.env, platform = process.platform, home = os.homedir()) {
  if (env.VIXEL_KIT_CACHE) return env.VIXEL_KIT_CACHE;
  if (platform === 'win32') return path.join(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'vixel-film-kit');
  if (platform === 'darwin') return path.join(home, 'Library', 'Caches', 'vixel-film-kit');
  return path.join(env.XDG_CACHE_HOME || path.join(home, '.cache'), 'vixel-film-kit');
}

// ------------------------------------------------------------------ processes

export function run(binary, args, { timeout = 600000, cwd, maxBuffer = 64 * 1024 * 1024 } = {}) {
  return new Promise(resolve => execFile(binary, args, { timeout, cwd, maxBuffer, windowsHide: true },
    (error, stdout, stderr) => resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout: String(stdout), stderr: String(stderr), error })));
}

export async function requireFfmpeg() {
  const [a, b] = await Promise.all([run('ffmpeg', ['-version'], { timeout: 15000 }), run('ffprobe', ['-version'], { timeout: 15000 })]);
  if (a.code || b.code) throw new KitError('FFMPEG_REQUIRED', 'Install FFmpeg and FFprobe (on PATH), then run this again.', 3);
}

export async function ffmpeg(args, options) {
  const result = await run('ffmpeg', ['-hide_banner', '-nostdin', ...args], options);
  if (result.code) throw new KitError('FFMPEG_FAILED', `FFmpeg failed: ${result.stderr.trim().split('\n').slice(-3).join(' | ')}`);
  return result;
}

export async function probeMedia(file) {
  const result = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { timeout: 60000 });
  if (result.code) throw new KitError('PROBE_FAILED', `FFprobe cannot read ${path.basename(file)}.`);
  const json = JSON.parse(result.stdout), video = json.streams?.find(s => s.codec_type === 'video'), audio = json.streams?.find(s => s.codec_type === 'audio');
  const duration = Number(json.format?.duration);
  const [n, d] = String(video?.avg_frame_rate || video?.r_frame_rate || '0/0').split('/').map(Number);
  return { durationMs: Number.isFinite(duration) ? Math.round(duration * 1000) : null, width: video?.width ?? null, height: video?.height ?? null,
    fps: d ? Math.round((n / d) * 100) / 100 : null, hasVideo: Boolean(video), hasAudio: Boolean(audio), videoCodec: video?.codec_name ?? null, audioCodec: audio?.codec_name ?? null };
}

export async function decodeErrors(file, kind) {
  const result = await run('ffmpeg', ['-hide_banner', '-nostdin', '-v', 'error', '-i', file, ...(kind === 'image' ? ['-frames:v', '1'] : []), '-f', 'null', '-'], { timeout: 600000 });
  const lines = result.stderr.split('\n').filter(Boolean);
  return result.code && !lines.length ? 1 : lines.length;
}

// ------------------------------------------------------------------ manifest

export function unwrapManifest(value) {
  for (const candidate of [value, value?.data, value?.structuredContent, value?.result?.structuredContent, value?.data?.manifest])
    if (candidate && typeof candidate === 'object' && 'contractVersion' in candidate) return candidate;
  const text = (value?.content || value?.result?.content)?.find?.(part => part?.type === 'text')?.text;
  if (text) { try { return unwrapManifest(JSON.parse(text)); } catch {} }
  throw new KitError('MANIFEST_INVALID', 'Pass the JSON returned by film_v1_export_manifest or `vixel exports manifest --json`.');
}

const isMs = value => Number.isFinite(value) && value >= 0 && value <= 3600000;
export function validateManifest(manifest, { acceptIssues = false } = {}) {
  if (manifest.contractVersion !== CUT_CONTRACT) throw new KitError('MANIFEST_UNSUPPORTED', `This kit reads ${CUT_CONTRACT} manifests; got ${JSON.stringify(manifest.contractVersion)}. Update the kit.`, 2);
  if (!Array.isArray(manifest.visuals) || !manifest.visuals.length || manifest.visuals.length > 200) throw new KitError('MANIFEST_INVALID', 'The manifest needs 1-200 visuals.');
  if (!Array.isArray(manifest.assets) || !manifest.assets.length || manifest.assets.length > 400) throw new KitError('MANIFEST_INVALID', 'The manifest needs its assets list.');
  if (!isMs(manifest.durationMs) || !manifest.durationMs) throw new KitError('MANIFEST_INVALID', 'The manifest duration is missing or longer than one hour.');
  const assets = new Map();
  for (const asset of manifest.assets) {
    if (!/^[A-Za-z0-9-]{8,64}$/.test(asset?.id || '') || !/^[a-f0-9]{64}$/.test(asset.sha256 || '') || !['video', 'image', 'audio'].includes(asset.kind)
      || !Number.isSafeInteger(asset.byteSize) || asset.byteSize < 1 || asset.byteSize > MAX_ASSET_BYTES || (asset.url != null && typeof asset.url !== 'string'))
      throw new KitError('ASSET_IDENTITY_INVALID', 'An asset has no verifiable id, kind, sha256 or byteSize (max 128 MiB).');
    if (assets.has(asset.id)) throw new KitError('MANIFEST_INVALID', 'Duplicate asset id.');
    assets.set(asset.id, asset);
  }
  for (const clip of [...manifest.visuals, ...(manifest.audio || [])]) {
    if (!assets.has(clip?.assetId) || ![clip.startMs, clip.sourceStartMs, clip.durationMs].every(isMs) || !clip.durationMs)
      throw new KitError('MANIFEST_INVALID', 'A clip references an unknown asset or has invalid timing.');
  }
  const issues = Array.isArray(manifest.issues) ? manifest.issues : [];
  if (issues.length && !acceptIssues) throw new KitError('CUT_HAS_ISSUES', `The cut has ${issues.length} open issue(s). Show them to the creator; rerun with --accept-issues only after they accept them.`, 2, { issues });
  return { issues };
}

export const shotIdFromKey = key => String(key || '').match(/\/shot\/([A-Za-z0-9-]{8,64})\//)?.[1] ?? null;

// ------------------------------------------------------------------ download

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
export function checkDownloadUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new KitError('ASSET_URL_INVALID', 'An asset url is not a URL.'); }
  if (parsed.protocol === 'https:' || parsed.protocol === 'file:') return parsed;
  if (parsed.protocol === 'http:' && LOOPBACK.has(parsed.hostname)) return parsed;
  throw new KitError('ASSET_URL_INVALID', 'Asset urls must be https (http only for localhost).');
}

async function bodyStream(url, timeoutMs) {
  const parsed = checkDownloadUrl(url);
  if (parsed.protocol === 'file:') return fs.createReadStream(fileURLToPath(parsed));
  // No cookies or credentials: export media urls are direct downloads.
  const response = await fetch(parsed, { headers: { 'user-agent': USER_AGENT, accept: '*/*' }, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  checkDownloadUrl(response.url || parsed.href);
  if (!response.ok) throw Object.assign(new KitError('DOWNLOAD_FAILED', `Download returned HTTP ${response.status}.`), { retry: response.status >= 500 || response.status === 429 });
  return response.body;
}

export async function downloadVerified(url, part, { sha256, byteSize, timeoutMs = 300000 }) {
  const hash = createHash('sha256');
  let size = 0;
  const out = fs.createWriteStream(part, { flags: 'w', mode: 0o644 });
  try {
    for await (const chunk of await bodyStream(url, timeoutMs)) {
      size += chunk.length;
      if (size > Math.min(byteSize, MAX_ASSET_BYTES)) throw new KitError('ASSET_HASH_MISMATCH', 'Download is larger than the manifest byteSize.');
      hash.update(chunk);
      if (!out.write(chunk)) await new Promise(resolve => out.once('drain', resolve));
    }
  } finally { await new Promise(resolve => out.end(resolve)); }
  if (size !== byteSize || hash.digest('hex') !== sha256) {
    await fsp.rm(part, { force: true });
    throw new KitError('ASSET_HASH_MISMATCH', 'Downloaded bytes differ from the manifest sha256/byteSize.');
  }
}

export async function withRetry(fn, attempts = 3) {
  for (let i = 1; ; i++) {
    try { return await fn(); }
    catch (e) {
      const retry = e.retry || (!(e instanceof KitError) && e.name !== 'AbortError');
      if (i >= attempts || !retry) throw e instanceof KitError ? e : new KitError('DOWNLOAD_FAILED', `Download failed: ${e.message}`);
      await new Promise(resolve => setTimeout(resolve, 1000 * i * i));
    }
  }
}

// ------------------------------------------------------------------ text, captions and alignment

const CJK = String.raw`\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}ー`;
const TOKEN = new RegExp(String.raw`[${CJK}]|[[\p{L}\p{N}\p{M}]--[${CJK}]]+(?:['’][[\p{L}\p{N}\p{M}]--[${CJK}]]+)*`, 'gv');
const CJK_CHAR = new RegExp(`[${CJK}]`, 'v');
export const isCjk = text => CJK_CHAR.test(text);

// Case-folds and drops Latin/Greek/Cyrillic accents; keeps kana voicing and Hangul intact.
export const normalizeKey = text => String(text).normalize('NFKD').replace(/(?<=[\p{sc=Latin}\p{sc=Greek}\p{sc=Cyrillic}])\p{M}+/gu, '')
  .normalize('NFC').toLowerCase().replace(/['’]/g, '');

export const wordKeys = text => [...String(text).matchAll(TOKEN)].map(match => normalizeKey(match[0]));

// Display tokens of a Script line: punctuation stays attached, `space` says whether a space precedes it.
export function scriptTokens(text) {
  const source = String(text || ''), out = [];
  let last = 0;
  for (const match of source.matchAll(TOKEN)) {
    const gap = source.slice(last, match.index), ws = gap.search(/\s/);
    let lead = gap.replace(/\s+/g, '');
    if (out.length) {
      const trail = ws < 0 ? gap : gap.slice(0, ws);
      out[out.length - 1].text += trail;
      lead = ws < 0 ? '' : gap.slice(ws).replace(/\s+/g, '');
    }
    out.push({ text: lead + match[0], key: normalizeKey(match[0]), space: out.length > 0 && ws >= 0, cjk: isCjk(match[0]) });
    last = match.index + match[0].length;
  }
  if (out.length) out[out.length - 1].text += source.slice(last).trim();
  return out;
}

// Caption[] (Remotion shape) -> word tokens; multi-character CJK captions share their time evenly.
export function heardTokens(captions) {
  const out = [];
  for (const caption of captions || []) {
    const keys = wordKeys(caption.text);
    const span = Math.max(0, caption.endMs - caption.startMs) / Math.max(1, keys.length);
    keys.forEach((key, i) => out.push({ key, text: caption.text.trim(), startMs: Math.round(caption.startMs + i * span), endMs: Math.round(caption.startMs + (i + 1) * span), confidence: caption.confidence ?? null }));
  }
  return out;
}

export function editDistance(a, b) {
  const x = [...a], y = [...b];
  let previous = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const current = [i];
    for (let j = 1; j <= y.length; j++) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[y.length];
}

// Tolerates transcription spelling slips (one edit for 4-6 letters, two for longer words).
export function sameWord(a, b) {
  if (a === b) return true;
  const longest = Math.max([...a].length, [...b].length);
  if (longest <= 3 || isCjk(a) || isCjk(b)) return false;
  return editDistance(a, b) <= (longest <= 6 ? 1 : 2);
}

// Global alignment of expected vs heard keys. ops: match | sub | del (expected not heard) | ins (heard, not expected).
export function alignTokens(expected, heard, same = sameWord) {
  const n = expected.length, m = heard.length;
  const cost = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++)
    cost[i][j] = Math.min(cost[i - 1][j - 1] + (same(expected[i - 1], heard[j - 1]) ? 0 : 1.5), cost[i - 1][j] + 1, cost[i][j - 1] + 1);
  const ops = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && same(expected[i - 1], heard[j - 1]) && cost[i][j] === cost[i - 1][j - 1]) { ops.push({ op: 'match', e: --i, h: --j }); continue; }
    if (j > 0 && cost[i][j] === cost[i][j - 1] + 1) { ops.push({ op: 'ins', e: null, h: --j }); continue; }
    if (i > 0 && cost[i][j] === cost[i - 1][j] + 1) { ops.push({ op: 'del', e: --i, h: null }); continue; }
    ops.push({ op: 'sub', e: --i, h: --j });
  }
  return ops.reverse();
}

// Times every Script token from the heard words (source-file ms); unmatched tokens interpolate between anchors.
export function timeScript(text, heard) {
  const tokens = scriptTokens(text);
  if (!tokens.length || !heard.length) return null;
  const ops = alignTokens(tokens.map(t => t.key), heard.map(h => h.key));
  const anchor = new Map(ops.filter(o => o.op === 'match' || o.op === 'sub').map(o => [o.e, heard[o.h]]));
  if (![...anchor.keys()].length || ops.filter(o => o.op === 'match').length === 0) return null;
  const timed = tokens.map((token, i) => ({ ...token, startMs: anchor.get(i)?.startMs ?? null, endMs: anchor.get(i)?.endMs ?? null }));
  for (let i = 0; i < timed.length; i++) {
    if (timed[i].startMs != null) continue;
    let k = i; while (k < timed.length && timed[k].startMs == null) k++;
    const from = i > 0 ? timed[i - 1].endMs : Math.max(0, (timed[k]?.startMs ?? 0) - 300 * (k - i));
    const to = k < timed.length ? timed[k].startMs : from + 300 * (k - i);
    const step = Math.max(0, to - from) / (k - i);
    for (let x = i; x < k; x++) Object.assign(timed[x], { startMs: Math.round(from + (x - i) * step), endMs: Math.round(from + (x - i + 1) * step) });
  }
  return timed;
}

// Planned timing when no transcript exists: spread by character weight across the used window.
export function planScript(text, startMs, endMs) {
  const tokens = scriptTokens(text);
  if (!tokens.length) return null;
  const from = startMs + Math.min(300, (endMs - startMs) * 0.1), to = Math.max(from + 200, endMs - Math.min(200, (endMs - startMs) * 0.1));
  const weights = tokens.map(t => [...t.key].length + 1), total = weights.reduce((a, b) => a + b, 0);
  let at = from;
  return tokens.map((token, i) => { const span = ((to - from) * weights[i]) / total; const out = { ...token, startMs: Math.round(at), endMs: Math.round(at + span) }; at += span; return out; });
}

// Splits timed tokens into on-screen chunks: one per sentence, and long sentences into balanced parts within a
// character budget (narrower for portrait; CJK characters count double), preferring breaks after commas.
export function chunkTokens(tokens, { portrait = false } = {}) {
  const budget = portrait ? 24 : 34, chunks = [], sentences = [[]];
  for (const token of tokens) { sentences[sentences.length - 1].push(token); if (/[.!?…。！？]["”’)]?$/u.test(token.text)) sentences.push([]); }
  for (const sentence of sentences.filter(s => s.length)) {
    const width = sentence.map(t => [...t.text].length * (t.cjk ? 2 : 1)), gap = sentence.map(t => (t.space ? 1 : 0));
    const length = (i, j) => { let n = 0; for (let k = i; k < j; k++) n += width[k] + (k > i ? gap[k] : 0); return n; };
    const total = length(0, sentence.length), target = total / Math.ceil(total / budget);
    const best = [0], cut = [0];
    for (let j = 1; j <= sentence.length; j++) {
      best[j] = Infinity;
      for (let i = j - 1; i >= 0; i--) {
        const n = length(i, j);
        if (n > budget && j - i > 1) break;
        const comma = j < sentence.length && /[,;:，、；：]["”’)]?$/u.test(sentence[j - 1].text) ? target * target * 0.1 : 0;
        const cost = best[i] + (target - n) ** 2 - comma;
        if (cost < best[j]) { best[j] = cost; cut[j] = i; }
      }
    }
    const parts = [];
    for (let j = sentence.length; j > 0; j = cut[j]) parts.unshift(sentence.slice(cut[j], j));
    chunks.push(...parts);
  }
  return chunks;
}

// ------------------------------------------------------------------ line check

const overlaps = (word, window) => word.endMs > window.startMs + 40 && word.startMs < window.endMs - 40;
const insideWindow = (word, window) => word.startMs >= window.startMs - 100 && word.endMs <= window.endMs + 100;
export function checkLine({ beat, heard, window, mediaDurationMs = null }) {
  const line = beat?.dialogue?.[0] || null;
  const inWindow = heard.filter(word => overlaps(word, window));
  const result = { expected: line?.text ?? null, speaker: line?.speaker ?? null, delivery: line?.delivery ?? (line ? 'on_screen' : null), heard: inWindow.map(w => w.text).filter((t, i, a) => t !== a[i - 1]).join(' ') };
  if (!line) {
    if (!inWindow.length) return { ...result, status: 'ok', suggestion: { fix: 'none' } };
    if (beat?.vocalSounds) return { ...result, status: 'check-vocal-sounds', suggestion: { fix: 'listen', note: 'The beat plans wordless sounds; confirm what was heard is not words.' } };
    return { ...result, status: 'unexpected-speech', suggestion: { fix: 'mute', where: 'edit', note: 'Mute this clip in the local edit, or retake with repair silence if its ambience matters.', retake: { repair: 'silence' } } };
  }
  const expected = scriptTokens(line.text), ops = alignTokens(expected.map(t => t.key), heard.map(h => h.key));
  const matched = ops.filter(o => o.op === 'match');
  const missing = ops.filter(o => o.op === 'del' || o.op === 'sub').map(o => expected[o.e].text);
  const misheard = ops.filter(o => o.op === 'sub').map(o => ({ expected: expected[o.e].text, heard: heard[o.h].text }));
  if (!matched.length) {
    return { ...result, status: 'missing-line', missing, suggestion: line.delivery === 'sung'
      ? { fix: 'listen', note: 'Sung words transcribe poorly; listen before retaking.' } : { fix: 'retake', repair: 'speech' } };
  }
  const first = matched[0].h, last = matched[matched.length - 1].h;
  const inserted = new Set(ops.filter(o => o.op === 'ins').map(o => o.h));
  const words = list => list.filter(h => inserted.has(h) && overlaps(heard[h], window)).map(h => heard[h].text);
  const range = (a, b) => Array.from({ length: Math.max(0, b - a) }, (_, k) => a + k);
  const extraBefore = words(range(0, first)), extraAfter = words(range(last + 1, heard.length)), extraInside = words(range(first + 1, last));
  const lineStart = heard[first].startMs, lineEnd = heard[last].endMs;
  const cutByTrim = matched.filter(o => !insideWindow(heard[o.h], window)).map(o => expected[o.e].text);
  const report = { ...result, missing, misheard, extraBefore, extraAfter, extraInside, cutByTrim, lineStartMs: lineStart, lineEndMs: lineEnd };
  const frames = n => Math.round((n * 1000) / FPS);
  if (missing.length && !(missing.length === 1 && expected.length >= 5))
    return { ...report, status: 'missing-words', suggestion: line.delivery === 'sung' ? { fix: 'listen' } : { fix: 'retake', repair: 'speech' } };
  if (cutByTrim.length) {
    const sourceStartMs = Math.max(0, Math.min(window.startMs, lineStart - frames(3)));
    const end = Math.max(window.endMs, lineEnd + frames(5));
    const fits = mediaDurationMs == null || end <= mediaDurationMs;
    return { ...report, status: 'cut-by-trim', suggestion: fits ? { fix: 'widen', where: 'timeline-or-edit', sourceStartMs, durationMs: end - sourceStartMs } : { fix: 'retake', repair: 'speech' } };
  }
  if (extraInside.length > 1) return { ...report, status: 'extra-words', suggestion: { fix: 'retake', repair: 'speech' } };
  if (extraBefore.length || extraAfter.length) {
    const sourceStartMs = extraBefore.length ? Math.max(window.startMs, lineStart - frames(3)) : window.startMs;
    const end = extraAfter.length ? Math.min(window.endMs, lineEnd + frames(5)) : window.endMs;
    if (end - sourceStartMs < 1000) return { ...report, status: 'extra-words', suggestion: { fix: 'retake', repair: 'speech' } };
    return { ...report, status: 'extra-words', suggestion: { fix: extraBefore.length && extraAfter.length ? 'trim-both' : extraBefore.length ? 'trim-head' : 'trim-tail', where: 'timeline-or-edit', sourceStartMs, durationMs: end - sourceStartMs } };
  }
  if (missing.length || extraInside.length || misheard.length) return { ...report, status: 'check', suggestion: { fix: 'listen', note: 'One word differs; it may be a transcription slip.' } };
  return { ...report, status: 'ok', suggestion: { fix: 'none' } };
}

// ------------------------------------------------------------------ beats and Shots

export function beatsFrom(value) {
  const beats = Array.isArray(value) ? value : value?.beats ?? value?.data?.beats ?? value?.input?.beats;
  if (!Array.isArray(beats)) throw new KitError('BEATS_INVALID', 'Pass the production_plan body you saved (with beats[]) or a beats array.');
  return beats.filter(beat => beat && typeof beat.shotKey === 'string');
}

function findShots(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6) return null;
  if (Array.isArray(value.shots) && value.shots.every(s => s && typeof s === 'object')) return value.shots;
  for (const child of Object.values(value)) { const found = findShots(child, depth + 1); if (found) return found; }
  return null;
}

// visual index -> shotKey, by explicit list, by the Work's Shots (accepted asset or shot id in the clip key), or by order.
export function mapVisualsToShots(visuals, { beats = [], work = null, shotKeys = null } = {}) {
  const shots = work ? findShots(work) || [] : [];
  const byKey = new Map(beats.map(beat => [beat.shotKey, beat]));
  return visuals.map((visual, i) => {
    let shotKey = shotKeys?.[i] || null, how = shotKey ? 'explicit' : null;
    if (!shotKey && shots.length) {
      const shot = shots.find(s => s.acceptedVideoAssetId === visual.assetId) || shots.find(s => s.id && s.id === shotIdFromKey(visual.key));
      if (shot?.shotKey) { shotKey = shot.shotKey; how = 'work'; }
    }
    if (!shotKey && beats.length === visuals.length) { shotKey = beats[i].shotKey; how = 'order'; }
    return { shotKey, how, beat: shotKey ? byKey.get(shotKey) || null : null };
  });
}

// ------------------------------------------------------------------ project paths

export function projectPaths(project) {
  const root = path.resolve(project || 'vixel-remotion');
  return { root, publicDir: path.join(root, 'public'), cutDir: path.join(root, 'public', CUT_DIR), cutJson: path.join(root, 'public', CUT_DIR, 'cut.json'),
    editJson: path.join(root, 'public', CUT_DIR, 'edit.json'), captionsDir: path.join(root, 'public', CUT_DIR, 'captions'), reviewDir: path.join(root, 'review'), outDir: path.join(root, 'out') };
}

export async function loadCut(project) {
  const paths = projectPaths(project);
  const cut = await readJson(paths.cutJson, 'cut.json (run fetch-cut.mjs first)');
  if (cut.kind !== 'vixel-cut-local-snapshot') throw new KitError('CUT_INVALID', 'cut.json was not written by fetch-cut.mjs.');
  return { cut, paths };
}

export async function loadCaptions(paths, index) {
  const file = path.join(paths.captionsDir, `${String(index).padStart(2, '0')}.json`);
  try { const captions = JSON.parse(await fsp.readFile(file, 'utf8')); return Array.isArray(captions) ? captions : null; }
  catch (e) { if (e.code === 'ENOENT') return null; throw new KitError('JSON_INVALID', `Cannot read ${file}.`); }
}

// ------------------------------------------------------------------ motion rhythm

const round = (value, digits = 0) => Math.round(value * 10 ** digits) / 10 ** digits;
const deviation = values => { const mean = values.reduce((a, b) => a + b, 0) / values.length; return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length); };
const standardize = values => { const mean = values.reduce((a, b) => a + b, 0) / values.length, sd = deviation(values) || 1; return values.map(v => (v - mean) / sd); };

// Rhythm of the dominant on-screen motion, from small grayscale frames (width*height bytes each). Each frame's row and
// column brightness profiles are matched against the previous frame to track vertical and horizontal shift; slow drift
// such as a push-in is removed with a 1.5 s moving average; the strongest autocorrelation peak between 0.25 s and 1.5 s
// is the period. hitsMs are the extremes of each cycle (the bottom of a nod, the landing of a step), the frames to cut on.
export function motionRhythm(pixels, width, height, fps, maxShift = 6) {
  const count = Math.floor(pixels.length / (width * height));
  const unclear = extra => ({ clear: false, bpm: null, periodSeconds: null, strength: 0, amplitudePercent: 0, hitsMs: [], ...extra });
  if (count < Math.ceil(fps * 1.5)) return unclear({ reason: 'too short' });
  const rows = [], cols = [];
  for (let f = 0; f < count; f++) {
    const base = f * width * height, r = new Array(height).fill(0), c = new Array(width).fill(0);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const v = pixels[base + y * width + x]; r[y] += v / width; c[x] += v / height; }
    rows.push(standardize(r)); cols.push(standardize(c));
  }
  const track = (profiles, size) => {
    const position = [0];
    for (let f = 1; f < profiles.length; f++) {
      // Smallest shift first, so a featureless profile (every shift scores the same) reads as no motion.
      let best = 0, bestScore = -Infinity;
      for (const shift of Array.from({ length: 2 * maxShift + 1 }, (_, k) => (k % 2 ? 1 : -1) * Math.ceil(k / 2))) {
        let score = 0;
        for (let i = maxShift; i < size - maxShift; i++) score += profiles[f][i] * profiles[f - 1][i - shift];
        if (score > bestScore) { bestScore = score; best = shift; }
      }
      position.push(position[position.length - 1] + best);
    }
    const half = Math.max(1, Math.round(fps * 0.75));
    return position.map((p, i) => { const window = position.slice(Math.max(0, i - half), i + half + 1); return p - window.reduce((a, b) => a + b, 0) / window.length; });
  };
  const vertical = track(rows, height), horizontal = track(cols, width);
  const pick = deviation(vertical) >= deviation(horizontal) ? { axis: 'vertical', track: vertical, size: height } : { axis: 'horizontal', track: horizontal, size: width };
  const amplitudePercent = round((100 * deviation(pick.track)) / pick.size, 1);
  const energy = pick.track.reduce((a, b) => a + b * b, 0);
  if (!energy) return unclear({ axis: pick.axis, reason: 'no motion' });
  const ac = lag => pick.track.slice(0, pick.track.length - lag).reduce((sum, v, i) => sum + v * pick.track[i + lag], 0) / energy;
  const lo = Math.max(2, Math.round(fps * 0.25)), hi = Math.min(pick.track.length - 2, Math.round(fps * 1.5));
  let lag = -1;
  for (let l = lo + 1; l < hi; l++) if (ac(l) > ac(l - 1) && ac(l) >= ac(l + 1) && (lag < 0 || ac(l) > ac(lag))) lag = l;
  if (lag < 0 || ac(lag) < 0.2) return unclear({ axis: pick.axis, amplitudePercent, strength: lag < 0 ? 0 : round(ac(lag), 2), reason: 'no steady rhythm' });
  const hitsMs = [];
  for (let i = 1; i < pick.track.length - 1; i++) {
    const ms = Math.round((i / fps) * 1000);
    if (pick.track[i] >= pick.track[i - 1] && pick.track[i] > pick.track[i + 1] && pick.track[i] > 0
      && (!hitsMs.length || ms - hitsMs[hitsMs.length - 1] > (lag / fps) * 600)) hitsMs.push(ms);
  }
  return { clear: true, axis: pick.axis, periodSeconds: round(lag / fps, 2), bpm: round((60 * fps) / lag), strength: round(ac(lag), 2), amplitudePercent, hitsMs };
}

export const kitRoot = () => path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Every kit file as {path, encoding, data}, sorted. The CLI embeds this to install the kit without a download.
export function listKitFiles(root = kitRoot()) {
  const out = [];
  const walk = relative => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '__pycache__') continue;
      if (entry.isDirectory()) walk(rel);
      else if (entry.isFile()) {
        const bytes = fs.readFileSync(path.join(root, rel)), binary = /\.(png|jpe?g|woff2?|ttf|otf|wav)$/i.test(entry.name);
        out.push({ path: rel, encoding: binary ? 'base64' : 'utf8', data: bytes.toString(binary ? 'base64' : 'utf8') });
      }
    }
  };
  walk('');
  return out;
}
