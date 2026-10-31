import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {Edit, FilmProps, Segment, musicGain, segmentRamp} from './data';

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const SANS = "'Sora', 'Noto Sans CJK SC', 'PingFang SC', 'Hiragino Sans', 'Apple SD Gothic Neo', 'Noto Sans', sans-serif";
const SERIF = "'Fraunces', 'Noto Serif CJK SC', 'Songti SC', Georgia, serif";
const pop = (frame: number, at: number, fps: number) => spring({frame: frame - at, fps, config: {damping: 10, stiffness: 150, mass: 0.6}});

const outlined = (edit: Edit, stroke: number): React.CSSProperties => ({
  color: edit.colors.cream, WebkitTextStroke: `${stroke}px ${edit.colors.ink}`, paintOrder: 'stroke fill', textShadow: '0 8px 18px rgba(0,0,0,0.35)', textAlign: 'center',
});

// Title over the first frame: a slow push-in while words pop in; words listed in accent take the accent colour.
const TitleCard: React.FC<{edit: Edit; seg: Segment}> = ({edit, seg}) => {
  const f = useCurrentFrame();
  const title = edit.title!;
  const longest = Math.max(1, ...title.rows.map((row) => [...row.join(' ')].length));
  const fontSize = Math.min(edit.portrait ? 170 : 160, Math.floor((edit.width - 140) / (longest * 0.62)));
  let n = 0;
  return (
    <AbsoluteFill>
      <Img src={staticFile(title.still)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.04 + 0.06 * (f / seg.frames)})`}} />
      <AbsoluteFill style={{background: `radial-gradient(ellipse at center, ${edit.colors.ink}26 30%, ${edit.colors.ink}8C 100%)`}} />
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: 10, padding: '0 60px', paddingBottom: edit.portrait ? 260 : 0}}>
        {title.rows.map((row, r) => (
          <div key={r} style={{display: 'flex', gap: 36, flexWrap: 'wrap', justifyContent: 'center'}}>
            {row.map((word, w) => {
              const i = n++;
              const s = pop(f, 8 + i * 7, edit.fps);
              return (
                <span key={`${word}-${w}`} style={{...outlined(edit, 12), fontFamily: SERIF, fontWeight: 700, fontSize, lineHeight: 1.05, display: 'inline-block',
                  transform: `scale(${s}) rotate(${(i % 2 ? 3 : -3) * s}deg)`, color: title.accent.includes(word) ? edit.colors.accent : edit.colors.cream}}>
                  {word}
                </span>
              );
            })}
          </div>
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Closing lines over the blurred last frame; the last line takes the highlight colour.
const EndCard: React.FC<{edit: Edit; seg: Segment}> = ({edit, seg}) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Img src={staticFile(edit.endStill)} style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${1.02 + 0.05 * (f / seg.frames)})`, filter: 'blur(6px) brightness(0.55)'}} />
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', gap: 18, flexDirection: 'column', padding: '0 70px', paddingBottom: edit.portrait ? 200 : 0}}>
        {edit.endLines.map((line, k) => {
          const s = pop(f, 10 + k * 18, edit.fps);
          return (
            <div key={k} style={{...outlined(edit, 10), fontFamily: SANS, fontWeight: 700, fontSize: edit.portrait ? 92 : 96, lineHeight: 1.15,
              color: k === edit.endLines.length - 1 ? edit.colors.highlight : edit.colors.cream, opacity: Math.min(1, s * 1.5), transform: `translateY(${(1 - s) * 40}px)`}}>
              {line}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const BrandCard: React.FC<{edit: Edit; seg: Segment}> = ({edit, seg}) => {
  const f = useCurrentFrame();
  const {fps} = edit;
  const rise = (at: number) => { const s = pop(f, at, fps); return {opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * 30}px)`}; };
  const sans: React.CSSProperties = {fontFamily: SANS, color: 'rgba(255,255,255,0.72)'};
  const icon = edit.portrait ? 150 : 168;
  return (
    <AbsoluteFill style={{opacity: interpolate(f, [0, edit.mix.fadeFrames], [0, 1], clamp), background: '#0B0A10'}}>
      <AbsoluteFill style={{background: 'radial-gradient(circle at 34% 38%, rgba(240,140,220,0.26), transparent 45%), radial-gradient(circle at 66% 64%, rgba(110,125,255,0.26), transparent 45%)', transform: `scale(${1 + 0.04 * (f / seg.frames)})`}} />
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', flexDirection: 'column', padding: '0 60px'}}>
        <div style={{...sans, fontSize: 30, fontWeight: 600, letterSpacing: 10, marginBottom: 34, ...rise(2)}}>{edit.brand.madeWith}</div>
        <div style={{display: 'flex', alignItems: 'center', gap: edit.portrait ? 36 : 44, transform: `scale(${pop(f, 6, fps)})`}}>
          <Img src={staticFile('vixel-film/brand/app-icon.png')} style={{width: icon, height: icon, borderRadius: 40, boxShadow: '0 18px 50px rgba(150,130,255,0.35)'}} />
          <span style={{fontFamily: SERIF, fontWeight: 700, fontSize: edit.portrait ? 170 : 190, color: '#fff', lineHeight: 1}}>{edit.brand.name}</span>
        </div>
        {edit.brand.tagline ? (
          <div style={{fontFamily: SERIF, fontWeight: 700, fontSize: edit.portrait ? 64 : 68, lineHeight: 1.2, color: '#F4F1FF', textAlign: 'center', marginTop: 54, maxWidth: edit.portrait ? 900 : 1500, ...rise(22)}}>{edit.brand.tagline}</div>
        ) : null}
        {edit.brand.url ? (
          <div style={{...sans, fontSize: 40, fontWeight: 600, color: '#fff', marginTop: 40, padding: '14px 40px', borderRadius: 999, border: '2px solid rgba(255,255,255,0.28)', background: 'rgba(255,255,255,0.06)', ...rise(36)}}>{edit.brand.url}</div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// Visible mark, top-right (clear of bottom platform controls), fading out as the brand card arrives.
const Watermark: React.FC<{edit: Edit}> = ({edit}) => {
  const f = useCurrentFrame();
  const brand = edit.segments.find((s) => s.card === 'brand');
  const o = brand ? interpolate(f, [brand.from, brand.from + edit.mix.fadeFrames], [1, 0], clamp) : 1;
  if (o <= 0) return null;
  return (
    <AbsoluteFill style={{justifyContent: 'flex-start', alignItems: 'flex-end', padding: edit.portrait ? '56px 48px' : '34px 44px', pointerEvents: 'none'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 12, opacity: 0.82 * o, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6)) drop-shadow(0 2px 10px rgba(0,0,0,0.45))'}}>
        <Img src={staticFile('vixel-film/brand/v-only.png')} style={{height: 40}} />
        <span style={{fontFamily: SERIF, fontWeight: 700, fontSize: 44, color: '#fff', lineHeight: 1}}>Vixel</span>
      </div>
    </AbsoluteFill>
  );
};

const Visual: React.FC<{edit: Edit; seg: Segment}> = ({edit, seg}) => {
  const f = useCurrentFrame();
  const ramp = (frame: number) => segmentRamp(seg, frame, edit.mix.fadeFrames);
  const src = staticFile(seg.src!);
  if (seg.kind === 'image') {
    const zoom = 1 + 0.06 * (f / seg.frames);
    return (
      <AbsoluteFill style={{opacity: ramp(f), background: '#000'}}>
        {seg.fit === 'contain' ? <Img src={src} style={{position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(40px) brightness(0.5)', transform: 'scale(1.1)'}} /> : null}
        <Img src={src} style={{width: '100%', height: '100%', objectFit: seg.fit ?? 'cover', transform: `scale(${zoom})`}} />
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{opacity: ramp(f), background: '#000'}}>
      <OffthreadVideo src={src} trimBefore={seg.trimBefore ?? 0} muted={!seg.hasAudio || seg.volume === 0} volume={(frame) => (seg.volume ?? 1) * ramp(frame)}
        style={{width: '100%', height: '100%', objectFit: seg.fit ?? 'cover'}} />
    </AbsoluteFill>
  );
};

const SegmentView: React.FC<{edit: Edit; seg: Segment}> = ({edit, seg}) =>
  seg.card === 'title' ? <TitleCard edit={edit} seg={seg} /> : seg.card === 'end' ? <EndCard edit={edit} seg={seg} /> : seg.card === 'brand' ? <BrandCard edit={edit} seg={seg} /> : <Visual edit={edit} seg={seg} />;

// One short chunk at a time; the spoken word lifts in the highlight colour. Portrait sits higher, clear of platform buttons.
const Subtitles: React.FC<{edit: Edit}> = ({edit}) => {
  const f = useCurrentFrame();
  const chunk = edit.subtitles.find((c) => f >= c.from && f < c.to);
  if (!chunk) return null;
  const s = 0.9 + 0.1 * pop(f, chunk.from, edit.fps);
  return (
    <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center', paddingBottom: edit.portrait ? 420 : 70}}>
      <div style={{maxWidth: edit.portrait ? 940 : 1500, textAlign: 'center', transform: `scale(${s})`, fontStyle: chunk.style === 'voice_over' ? 'italic' : 'normal'}}>
        {chunk.style === 'sung' ? <span style={{...outlined(edit, 11), fontFamily: SANS, fontWeight: 700, fontSize: edit.portrait ? 70 : 66, margin: '0 10px'}}>♪</span> : null}
        {chunk.words.map((w, i) => {
          const on = f >= w.from && f < Math.max(w.to, w.from + 4);
          return (
            <span key={i} style={{...outlined(edit, 11), fontFamily: SANS, fontWeight: 700, fontSize: edit.portrait ? 70 : 66, color: on ? edit.colors.highlight : edit.colors.cream,
              display: 'inline-block', marginLeft: i > 0 && w.space ? 18 : 2, transform: on ? 'translateY(-4px)' : 'none'}}>
              {w.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

// Branded = visible watermark (+ brand card when enabled). Clean = no mark or brand card, for entitled creators only.
// Final sound is mixed by the kit's render.mjs with the same constants; the audio here is for Studio preview.
export const Film: React.FC<FilmProps> = ({branded, edit}) => {
  const {durationInFrames} = useVideoConfig();
  if (!edit) return null;
  return (
    <AbsoluteFill style={{background: '#000'}}>
      {edit.segments.filter((s) => branded || s.card !== 'brand').map((s) => (
        <Sequence key={s.id} from={s.from} durationInFrames={s.frames}>
          <SegmentView edit={edit} seg={s} />
        </Sequence>
      ))}
      {edit.audio.map((a, i) => (
        <Sequence key={`audio-${i}`} from={a.from} durationInFrames={a.frames}>
          <Audio src={staticFile(a.src)} trimBefore={a.trimBefore} volume={a.volume} />
        </Sequence>
      ))}
      <Subtitles edit={edit} />
      {branded ? <Watermark edit={edit} /> : null}
      {edit.music.src ? <Audio src={staticFile(edit.music.src)} volume={(f) => musicGain(edit, f, durationInFrames)} /> : null}
    </AbsoluteFill>
  );
};
