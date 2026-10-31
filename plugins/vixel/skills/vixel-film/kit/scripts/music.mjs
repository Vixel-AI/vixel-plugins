#!/usr/bin/env node
// Procedural music bed: plucked strings, bells, pads, bass and shaker synthesized from code (no samples), 48 kHz stereo WAV.
// Harmony is F major / D minor at 100 BPM by default (60-180 with --bpm, to match the rhythm measured in the clips); each
// four-beat bar takes the mood of the section it falls in and the bed ends on the tonic.
// Moods: play, tiptoe, lullaby, upbeat, tense, sad. The same input always gives the same bytes.
// Usage: node music.mjs --out bed.wav --seconds 30 [--mood play] [--bpm 100] [--transpose 0] [--seed 7]
// make-edit.mjs calls this with the film's sections. A creator who wants real music supplies a track they hold rights to.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { KitError, parseArgs, isMain, runMain } from './lib.mjs';

export const SR = 48000;
export const MOODS = ['play', 'tiptoe', 'lullaby', 'upbeat', 'tense', 'sad'];
const MINOR = new Set(['tense', 'sad']);
export const DEFAULT_BPM = 100;
export function checkBpm(value) {
  const bpm = value == null || value === '' ? DEFAULT_BPM : Number(value);
  if (!(bpm >= 60 && bpm <= 180)) throw new KitError('MUSIC_INVALID', 'The music tempo must be between 60 and 180 BPM.');
  return bpm;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const TABLE = 8192, SINE = Float32Array.from({ length: TABLE + 1 }, (_, i) => Math.sin((2 * Math.PI * i) / TABLE));
const PADWAVE = (() => { const w = new Float32Array(TABLE + 1); for (let i = 0; i <= TABLE; i++) for (let h = 1; h <= 5; h++) w[i] += Math.sin((2 * Math.PI * h * i) / TABLE) / h ** 1.6; return w; })();
const BASSWAVE = Float32Array.from({ length: TABLE + 1 }, (_, i) => { const x = (2 * Math.PI * i) / TABLE; return Math.sin(x) + 0.35 * Math.sin(2 * x) + 0.12 * Math.sin(3 * x); });
const lookup = (table, phase) => { const p = (phase - Math.floor(phase)) * TABLE, i = p | 0; return table[i] + (table[i + 1] - table[i]) * (p - i); };

function biquad(x, freq, kind) {
  const w = (2 * Math.PI * freq) / SR, cos = Math.cos(w), alpha = Math.sin(w) / Math.SQRT2, a0 = 1 + alpha;
  const b0 = (kind === 'low' ? (1 - cos) / 2 : (1 + cos) / 2) / a0, b1 = (kind === 'low' ? 1 - cos : -(1 + cos)) / a0, b2 = b0, a1 = (-2 * cos) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y; }
  return x;
}
const fadeTail = (x, seconds) => { const n = Math.min(x.length, Math.floor(seconds * SR)); for (let i = 0; i < n; i++) x[x.length - n + i] *= 1 - i / n; return x; };

function pluck(rng, f, dur, bright = 0.5, decay = 0.996) {
  const n = Math.floor(dur * SR), N = Math.max(2, Math.floor(SR / f)), y = new Float32Array(n + N + 1);
  const burst = biquad(Float32Array.from({ length: N }, () => rng() * 2 - 1), 1500 + 6000 * bright, 'low');
  const mean = burst.reduce((a, b) => a + b, 0) / N;
  for (let i = 0; i < N; i++) y[i + 1] = burst[i] - mean;
  for (let k = N + 1; k < y.length; k++) y[k] = decay * 0.5 * (y[k - N] + y[k - N - 1]);
  const out = y.slice(N + 1);
  for (let i = 0; i < Math.min(n, 0.003 * SR); i++) out[i] *= i / (0.003 * SR);
  return fadeTail(out, 0.05);
}

function bell(f, dur, hard = 0.6) {
  const n = Math.floor(dur * SR), out = new Float32Array(n);
  for (const [ratio, amp, tau] of [[1, 1, 1.6], [2, 0.35 * hard, 0.9], [3.01, 0.18 * hard, 0.5], [5.43, 0.08 * hard, 0.25]]) {
    const step = (f * ratio) / SR, k = Math.exp(-1 / (tau * SR));
    let env = amp;
    for (let i = 0; i < n; i++, env *= k) out[i] += env * lookup(SINE, i * step);
  }
  for (let i = 0; i < Math.min(n, 0.002 * SR); i++) out[i] *= i / (0.002 * SR);
  return fadeTail(out, 0.08);
}

function pad(rng, freqs, dur, attack = 0.6, release = 1.4, warm = 1800) {
  const n = Math.floor((dur + release) * SR), out = new Float32Array(n);
  for (const f of freqs) for (const detune of [-0.006, 0, 0.0055]) {
    const phase = rng(), step = (f * (1 + detune)) / SR;
    for (let i = 0; i < n; i++) out[i] += lookup(PADWAVE, phase + i * step);
  }
  biquad(out, warm, 'low');
  const scale = 1 / (freqs.length * 3);
  for (let i = 0; i < n; i++) { const t = i / SR; out[i] *= scale * Math.min(1, t / attack) * (t > dur ? Math.exp(-(t - dur) / (release / 3)) : 1); }
  return out;
}

function bass(f, dur) {
  const n = Math.floor(dur * SR), out = new Float32Array(n), step = f / SR, k = Math.exp(-1 / (0.28 * SR));
  let env = 1;
  for (let i = 0; i < n; i++, env *= k) out[i] = lookup(BASSWAVE, i * step) * env * Math.min(1, i / (0.004 * SR));
  return fadeTail(out, 0.04);
}

function shaker(rng, dur = 0.09) {
  const n = Math.floor(dur * SR), out = biquad(Float32Array.from({ length: n }, () => rng() * 2 - 1), 5500, 'high');
  for (let i = 0; i < n; i++) out[i] *= Math.min(1, i / (0.01 * SR)) * Math.exp(-i / (0.025 * SR));
  return out;
}

// Freeverb-style rooms; different comb lengths per channel give width.
function reverb(x, wet, spread) {
  const out = new Float32Array(x.length), combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(d => Math.round(((d + spread) * SR) / 44100));
  for (const d of combs) {
    const line = new Float32Array(d); let idx = 0, low = 0;
    for (let i = 0; i < x.length; i++) { const y = line[idx]; low = y * 0.8 + low * 0.2; line[idx] = x[i] * 0.015 + low * 0.84; out[i] += y; if (++idx === d) idx = 0; }
  }
  for (const d of [556, 441, 341, 225].map(v => Math.round(((v + spread) * SR) / 44100))) {
    const line = new Float32Array(d); let idx = 0;
    for (let i = 0; i < out.length; i++) { const b = line[idx], y = -out[i] + b; line[idx] = out[i] + b * 0.5; out[i] = y; if (++idx === d) idx = 0; }
  }
  for (let i = 0; i < x.length; i++) out[i] = (1 - wet) * x[i] + wet * out[i];
  return out;
}

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = name => { const m = name.match(/^([A-G])([#b]?)(-?\d)$/); return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
const CHORDS = { F: [41, 48, 53, 57, 60, 65], Dm: [38, 45, 50, 53, 57, 62], Bb: [34, 41, 46, 50, 53, 58], C: [36, 43, 48, 52, 55, 60] };
const PROGRESSION = { major: ['F', 'Dm', 'Bb', 'C'], minor: ['Dm', 'Bb', 'F', 'C'] };
const MELODY = [
  [['C5', 0.5], ['F5', 0.5], ['A5', 1], ['G5', 0.5], ['F5', 0.5], ['C5', 1]], [['D5', 0.5], ['F5', 0.5], ['A5', 1], [null, 1], ['G5', 0.5], ['F5', 0.5]],
  [['D5', 0.5], ['F5', 0.5], ['Bb5', 1], ['A5', 0.5], ['G5', 0.5], ['F5', 1]], [['E5', 1], ['G5', 1], ['C6', 1.5], [null, 0.5]],
  [['A5', 0.5], ['C6', 0.5], ['A5', 1], ['F5', 1], ['C5', 1]], [['D5', 0.5], ['E5', 0.5], ['F5', 0.5], ['A5', 0.5], ['D6', 2]],
  [['Bb5', 0.5], ['A5', 0.5], ['G5', 1], ['F5', 0.5], ['D5', 0.5], ['F5', 1]], [['G5', 1], ['E5', 1], ['C5', 2]],
];
const LULLABY = [[['A5', 2], ['C6', 2]], [['A5', 2], ['F5', 2]], [['F5', 2], ['D5', 2]], [['E5', 4]]];
const SAD = [[['D5', 2], ['F5', 2]], [['F5', 1], ['E5', 1], ['D5', 2]], [['C5', 2], ['A4', 2]], [['E5', 3], [null, 1]]];
const ARRANGEMENT = {
  play: { bass: 1, arp: 'eighth', mel: 1, pad: 0, shaker: 0.5 }, tiptoe: { bass: 0, arp: 'tiptoe', mel: 0, pad: 0.6, shaker: 0 },
  lullaby: { bass: 0, arp: 'slow', mel: 0.8, pad: 0.7, shaker: 0 }, upbeat: { bass: 1.1, arp: 'sixteenth', mel: 1, pad: 0, shaker: 0.8 },
  tense: { bass: 0.6, arp: 'pulse', mel: 0, pad: 0.5, shaker: 0, warm: 900 }, sad: { bass: 0, arp: 'slow', mel: 0.7, pad: 0.8, shaker: 0 },
};

export function normalizeSections(sections, totalSeconds) {
  const list = (sections?.length ? sections : [{ startSeconds: 0, mood: 'play' }]).map(s => ({ startSeconds: Math.max(0, Number(s.startSeconds) || 0), mood: MOODS.includes(s.mood) ? s.mood : 'play' }))
    .sort((a, b) => a.startSeconds - b.startSeconds);
  list[0].startSeconds = 0;
  if (!(totalSeconds > 0 && totalSeconds <= 3600)) throw new KitError('MUSIC_INVALID', 'Music length must be between 0 and 3600 seconds.');
  return list;
}

// Returns interleaved stereo Float32 samples of exactly totalSeconds.
export function synthBed({ sections, totalSeconds, transpose = 0, seed = 7, bpm = DEFAULT_BPM }) {
  const list = normalizeSections(sections, totalSeconds), rng = mulberry32(seed);
  const BEAT = 60 / checkBpm(bpm), BAR = 4 * BEAT;
  const hz = m => 440 * 2 ** ((m + transpose - 69) / 12);
  const length = Math.ceil((totalSeconds + 3) * SR), bus = { mel: new Float32Array(length), arp: new Float32Array(length), pad: new Float32Array(length), bass: new Float32Array(length), perc: new Float32Array(length) };
  const add = (target, signal, t0, gain) => { const i = Math.floor(t0 * SR); for (let k = 0; k < signal.length && i + k < target.length; k++) if (i + k >= 0) target[i + k] += gain * signal[k]; };
  const moodAt = t => list.reduce((mood, s) => (s.startSeconds <= t ? s.mood : mood), list[0].mood);
  const bars = Math.floor(totalSeconds / BAR) + 1, last = bars - 1;
  for (let b = 0; b < bars; b++) {
    const t0 = b * BAR, mood = moodAt(t0 + BAR / 2), cfg = ARRANGEMENT[mood], mode = MINOR.has(mood) ? 'minor' : 'major';
    const finalMode = MINOR.has(moodAt(totalSeconds - 0.01)) ? 'minor' : 'major';
    const chord = b === last ? PROGRESSION[finalMode][0] : PROGRESSION[mode][b % 4], voicing = CHORDS[chord];
    if (cfg.pad) add(bus.pad, pad(rng, voicing.slice(1, 5).map(hz), BAR + 0.1, 0.6, 1.4, cfg.warm || 1800), t0, 0.5 * cfg.pad);
    if (cfg.bass) {
      const hits = cfg.arp === 'sixteenth' || cfg.arp === 'pulse' ? [0, 1, 2, 3] : [0, 2];
      hits.forEach((beat, k) => add(bus.bass, bass(hz(k % 2 && voicing[1] > 46 ? voicing[1] - 12 : voicing[k % 2]), BEAT * 0.9), t0 + beat * BEAT, (k ? 0.5 : 0.7) * cfg.bass));
    }
    if (cfg.arp === 'eighth' || cfg.arp === 'sixteenth') {
      const steps = cfg.arp === 'eighth' ? 8 : 16, pattern = [2, 3, 4, 3, 5, 3, 4, 3];
      for (let i = 0; i < steps; i++) add(bus.arp, pluck(rng, hz(voicing[pattern[i % 8]]), 1.2, 0.35, 0.995), t0 + (i * BAR) / steps + (i % 2 ? 0.02 : 0), i % 2 ? 0.18 : 0.26);
    } else if (cfg.arp === 'tiptoe') {
      [3, 5, 4, 5].forEach((idx, i) => add(bus.arp, pluck(rng, hz(voicing[idx] + 12), 0.6, 0.2, 0.99), t0 + i * BEAT, 0.16));
    } else if (cfg.arp === 'pulse') {
      for (let i = 0; i < 8; i++) add(bus.arp, pluck(rng, hz(voicing[i % 2 ? 1 : 0] + 12), 0.5, 0.1, 0.985), t0 + (i * BEAT) / 2, i % 2 ? 0.14 : 0.22);
    } else if (cfg.arp === 'slow') {
      for (const [i, idx] of [2, 3, 4, 5].entries()) { add(bus.arp, bell(hz(voicing[idx] + 12), 2.2, 0.2), t0 + i * BEAT, 0.13); if (b === last) break; }
    }
    if (cfg.mel) {
      const phrase = b === last ? [[mode === 'minor' ? 'D5' : 'F5', 4]] : mood === 'lullaby' ? LULLABY[b % 4] : mood === 'sad' ? SAD[b % 4] : MELODY[b % 8];
      let t = t0;
      for (const [name, beats] of phrase) { if (name) add(bus.mel, bell(hz(midi(name)), Math.max(1, beats * BEAT + 0.8), 0.45), t, 0.3 * cfg.mel); t += beats * BEAT; }
    }
    if (cfg.shaker) for (let i = 0; i < 8; i++) add(bus.perc, shaker(rng), t0 + (i * BEAT) / 2 + (i % 2 ? 0.02 : 0), (i % 2 ? 0.09 : 0.05) * cfg.shaker);
  }
  const mix = new Float32Array(length);
  for (let i = 0; i < length; i++) mix[i] = bus.mel[i] + 0.9 * bus.arp[i] + 0.7 * bus.pad[i] + bus.bass[i] + 0.8 * bus.perc[i];
  biquad(mix, 50, 'high');
  const side = (source, shift) => Float32Array.from(mix, (v, i) => v + 0.15 * (i >= shift ? source[i - shift] : 0));
  const left = reverb(side(bus.arp, 300), 0.28, 0), right = reverb(side(bus.mel, 220), 0.28, 23);
  const n = Math.round(totalSeconds * SR), fade = Math.min(n, Math.round(1.5 * SR)), out = new Float32Array(n * 2);
  let peak = 1e-9;
  for (let i = 0; i < n; i++) { const g = i >= n - fade ? (n - i) / fade : 1; out[2 * i] = left[i] * g; out[2 * i + 1] = right[i] * g; peak = Math.max(peak, Math.abs(out[2 * i]), Math.abs(out[2 * i + 1])); }
  for (let i = 0; i < out.length; i++) out[i] *= 0.89 / peak;
  return out;
}

export function wavBytes(interleaved, sampleRate = SR, channels = 2) {
  const data = Buffer.alloc(interleaved.length * 2), header = Buffer.alloc(44);
  for (let i = 0; i < interleaved.length; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(interleaved[i] * 32767))), i * 2);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8); header.write('fmt ', 12); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(channels, 22); header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * channels * 2, 28);
  header.writeUInt16LE(channels * 2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export async function writeBed(file, options) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const bytes = wavBytes(synthBed(options));
  await fsp.writeFile(file, bytes);
  return { file, seconds: options.totalSeconds, bytes: bytes.length };
}

if (isMain(import.meta)) runMain(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  if (!flags.out || !flags.seconds) throw new KitError('ARGUMENT_MISSING', 'Use --out <file.wav> --seconds <length> [--mood play].');
  return writeBed(path.resolve(flags.out), { sections: [{ startSeconds: 0, mood: flags.mood || 'play' }], totalSeconds: Number(flags.seconds),
    transpose: Number(flags.transpose) || 0, seed: Number(flags.seed) || 7, bpm: checkBpm(flags.bpm) });
});
