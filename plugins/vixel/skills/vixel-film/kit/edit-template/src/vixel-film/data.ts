// Shape of public/cut/edit.json (written by the kit's make-edit.mjs) and the timing helpers shared with render.mjs.
export type Card = 'title' | 'end' | 'brand';
export type Segment = {
  id: string; from: number; frames: number; mood: string | null; card?: Card;
  visual?: number; shotKey?: string | null; src?: string; kind?: 'video' | 'image'; trimBefore?: number; hasAudio?: boolean;
  volume?: number; fadeIn?: boolean; fadeOut?: boolean; fit?: 'cover' | 'contain';
};
export type SubtitleWord = {text: string; space: boolean; from: number; to: number};
export type SubtitleChunk = {from: number; to: number; style: 'line' | 'voice_over' | 'sung'; speaker: string | null; words: SubtitleWord[]};
export type Edit = {
  kind: 'vixel-edit'; version: number; fps: number; width: number; height: number; portrait: boolean; cleanExportEntitled: boolean;
  colors: {cream: string; ink: string; accent: string; highlight: string};
  title: {text: string; rows: string[][]; accent: string[]; still: string} | null;
  endLines: string[]; endStill: string;
  brand: {card: boolean; madeWith: string; name: string; tagline: string; url: string};
  segments: Segment[];
  audio: {src: string; from: number; frames: number; trimBefore: number; volume: number}[];
  subtitles: SubtitleChunk[];
  speech: {from: number; to: number}[];
  music: {src: string | null; kind: 'generated' | 'creator' | 'none'};
  mix: {fadeFrames: number; duckRampFrames: number; musicVolume: number; musicDuckVolume: number; musicFadeOutSeconds: number};
  totals: {Film: number; FilmVixel: number; cut: number};
};
export type FilmProps = {branded: boolean; edit: Edit | null};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

// Fade multiplier of a segment at a frame relative to its start.
export const segmentRamp = (seg: Segment, frame: number, fadeFrames: number) =>
  (seg.fadeIn ? clamp01(frame / fadeFrames) : 1) * (seg.fadeOut ? clamp01((seg.frames - frame) / fadeFrames) : 1);

// Music gain: ducked under speech with short ramps, faded over the last second of the composition.
export const musicGain = (edit: Edit, frame: number, total: number) => {
  const k = edit.mix.duckRampFrames;
  let duck = 0;
  for (const s of edit.speech) duck = Math.max(duck, clamp01(Math.min((frame - (s.from - k)) / k, (s.to + k - frame) / k)));
  const tail = clamp01((total - frame) / (edit.mix.musicFadeOutSeconds * edit.fps));
  return (edit.mix.musicVolume - (edit.mix.musicVolume - edit.mix.musicDuckVolume) * duck) * tail;
};
