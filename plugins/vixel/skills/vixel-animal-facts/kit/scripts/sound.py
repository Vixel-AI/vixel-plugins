# Synthesised cartoon score and sound effects, mixed under the narration, loudness-normalised and muxed.
#
#   sound.py out/video.sound.json --voice audio/vo.wav --video out/video.mp4 --out out/final.mp4
#   sound.py out/video.sound.json --voice audio/vo.wav --out out/mix.wav          (audio only)
#
# The cues file comes from render.py (duration, music, ambience and timed events). Options override it:
# --music synth|none|<track you hold rights to>, --bpm, --ambience bubbles|none. The final file is
# H.264 CRF 21 with AAC 192k at -14 LUFS and at most -1.5 dBTP; FINAL.qa.json records the measurement.
import argparse, json, math, os, re, shutil, subprocess, sys
import numpy as np, soundfile as sf
from scipy.signal import resample_poly, butter, sosfilt

SR = 48000
LOUDNESS = {"I": -14, "TP": -1.5, "LRA": 11}
rng = np.random.default_rng(11)

def t_(d): return np.arange(int(d * SR)) / SR
def adsr(n, a=0.005, r=0.1):
    e = np.ones(n); na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr and nr < n: e[-nr:] *= np.linspace(1, 0, nr)
    return e
def lp(x, f, o=2): return sosfilt(butter(o, f, "low", fs=SR, output="sos"), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, "high", fs=SR, output="sos"), x)
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], "band", fs=SR, output="sos"), x)
def chirp(f0, f1, d, shape="sine"):
    t = t_(d); f = f0 * (f1 / f0) ** (t / d); ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) if shape == "sine" else (2 * ((ph / (2 * np.pi)) % 1) - 1)
def note(f): return 440 * 2 ** ((f - 69) / 12)

def pluck(freq, d=0.6, bright=0.5):
    """Karplus-Strong string pluck (ukulele-ish)."""
    n = int(d * SR); p = max(2, int(SR / freq))
    buf = rng.uniform(-1, 1, p); out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = 0.5 * (buf[i % p] + buf[(i + 1) % p]) * (0.993 + 0.004 * bright)
    return out * adsr(n, 0.002, 0.08)

_pl = {}
def pl(m, d=0.5):
    k = (m, d)
    if k not in _pl: _pl[k] = pluck(note(m), d)
    return _pl[k]

def add(buf, x, t, g=1.0):
    i = int(t * SR)
    if i >= len(buf) or i + len(x) <= 0: return
    j0 = max(0, -i); j1 = min(len(x), len(buf) - i)
    buf[i + j0:i + j1] += x[j0:j1] * g

def synth_music(dur, bpm=120):
    """Bouncy ukulele, bass, light drums and a bell motif over C G Am F, with a final chord."""
    n = int(dur * SR); music = np.zeros(n)
    beat = 60 / bpm; bar = 4 * beat
    chords = [[60, 64, 67], [55, 59, 62, 67], [57, 60, 64], [53, 57, 60, 65]]   # C G Am F
    roots = [36, 43, 45, 41]
    bells = [[76, 79, 81, 79], [74, 79, 83, 79], [76, 72, 76, 81], [77, 76, 74, 72]]
    end_music = dur - 1.4
    for b in range(int(end_music / bar) + 1):
        t0 = b * bar; ch = chords[b % 4]
        for k, off in enumerate([0, 1, 1.5, 2, 3, 3.5]):        # strum pattern
            tt = t0 + off * beat
            if tt > end_music: break
            for j, m in enumerate(ch):
                add(music, pl(m + 12, 0.45), tt + j * 0.008, 0.16 if off % 1 == 0 else 0.10)
        for off in (0, 2):                                       # bass
            tt = t0 + off * beat
            if tt > end_music: break
            x = np.sin(2 * np.pi * note(roots[b % 4]) * t_(0.45)) * np.exp(-t_(0.45) * 6)
            add(music, x, tt, 0.35)
        for off in range(4):                                     # drums
            tt = t0 + off * beat
            if tt > end_music: break
            if off in (0, 2):
                add(music, chirp(130, 45, 0.18) * np.exp(-t_(0.18) * 18), tt, 0.5)
            else:
                sn = bp(rng.standard_normal(int(0.12 * SR)), 900, 5000) * np.exp(-t_(0.12) * 30)
                add(music, sn, tt, 0.22)
            for s in range(4):
                sh = hp(rng.standard_normal(int(0.04 * SR)), 6000) * np.exp(-t_(0.04) * 90)
                add(music, sh, tt + s * beat / 4, 0.05)
        if b % 2 == 1:                                           # bell motif every other bar
            for k, m in enumerate(bells[b % 4]):
                tt = t0 + k * beat
                x = (np.sin(2 * np.pi * note(m) * t_(0.6)) + 0.3 * np.sin(2 * np.pi * note(m) * 2.76 * t_(0.6))) * np.exp(-t_(0.6) * 7)
                add(music, x, tt, 0.07)
    for j, m in enumerate([60, 64, 67, 72]): add(music, pl(m + 12, 1.4), end_music + 0.02 + j * 0.02, 0.2)
    add(music, np.sin(2 * np.pi * note(36) * t_(1.4)) * np.exp(-t_(1.4) * 3), end_music, 0.35)
    return music

def track_music(path, dur):
    """A music file the creator holds rights to, decoded by FFmpeg, looped or trimmed, with a 1.4 s fade."""
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).astype(np.float64)
    if not len(x): raise SystemExit(f"{path}: no audio")
    n = int(dur * SR); x = np.tile(x, n // len(x) + 1)[:n]
    f = int(1.4 * SR); x[-f:] *= np.linspace(1, 0, f)
    return x

# ---------------- sound effects ----------------
def whoosh(d=0.35, lo=300, hi=3000, g=1.0):
    n = int(d * SR); x = rng.standard_normal(n); out = np.zeros(n); seg = 512
    for i in range(0, n, seg):
        f = lo + (hi - lo) * math.sin(math.pi * i / n)
        out[i:i + seg] = bp(x[i:i + seg], max(80, f * 0.6), min(SR / 2 - 100, f * 1.6))
    return out * np.sin(np.linspace(0, np.pi, n)) ** 1.5 * g
def pop(f0=700, f1=240): return chirp(f0, f1, 0.08) * np.exp(-t_(0.08) * 30)
def boing():
    t = t_(0.55); f = 180 + 120 * t / 0.55 + 40 * np.sin(2 * np.pi * 16 * t) * np.exp(-t * 4)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 5)
def impact():
    return lp(chirp(100, 38, 0.3) * np.exp(-t_(0.3) * 10) + 0.5 * lp(rng.standard_normal(int(0.3 * SR)), 600) * np.exp(-t_(0.3) * 22), 900)
def sparkle():
    out = np.zeros(int(0.8 * SR))
    for k, m in enumerate([84, 88, 91, 96, 100]):
        x = np.sin(2 * np.pi * note(m) * t_(0.3)) * np.exp(-t_(0.3) * 12); add(out, x, k * 0.07, 0.5)
    return out
def buzzer():
    t = t_(0.45); x = np.sign(np.sin(2 * np.pi * 110 * t)) + 0.5 * np.sign(np.sin(2 * np.pi * 116 * t))
    return lp(x, 1800) * adsr(len(t), 0.005, 0.05) * 0.5
def chomp():
    out = np.zeros(int(0.16 * SR))
    for k in (0, 0.07):
        x = lp(rng.standard_normal(int(0.05 * SR)), 1500) * np.exp(-t_(0.05) * 50) + 0.6 * np.sin(2 * np.pi * 160 * t_(0.05)) * np.exp(-t_(0.05) * 40)
        add(out, x, k, 1.0)
    return out
def zip_():
    return whoosh(0.28, 600, 6000, 0.8) + 0.3 * chirp(400, 1600, 0.28) * np.sin(np.linspace(0, np.pi, int(0.28 * SR)))
def ticks(d):
    out = np.zeros(int(d * SR)); tt = 0.0
    while tt < d:
        f = 900 + 1400 * tt / d
        x = np.sin(2 * np.pi * f * t_(0.025)) * np.exp(-t_(0.025) * 120); add(out, x, tt, 0.7)
        tt += max(0.022, 0.11 * (1 - tt / d) ** 1.5)
    return out
def burst():
    out = whoosh(0.6, 200, 2500, 1.0) + 0.0
    add(out, pop(500, 120) * 2, 0.0); add(out, sparkle(), 0.1, 0.6)
    for k in range(14):
        x = chirp(400 + 60 * k, 1200 + 80 * k, 0.06) * np.exp(-t_(0.06) * 40); add(out, x, 0.05 + k * 0.03, 0.35)
    return out
def flip():
    out = np.zeros(int(0.25 * SR))
    for k in (0, 0.09): add(out, hp(rng.standard_normal(int(0.07 * SR)), 2500) * np.exp(-t_(0.07) * 45), k, 0.8)
    return out
def trombone():
    notes = [(55, 0.24), (54, 0.24), (53, 0.24), (52, 0.75)]; out = np.zeros(int(1.6 * SR)); tt = 0.0
    for i, (m, d) in enumerate(notes):
        t = t_(d); vib = 1 + (0.03 * np.sin(2 * np.pi * 6 * t) if i == 3 else 0)
        ph = 2 * np.pi * np.cumsum(note(m) * vib) / SR
        x = sum((1 / h) * np.sin(h * ph) for h in range(1, 9))
        x = lp(x, 1400) * adsr(len(t), 0.03, 0.08 if i < 3 else 0.3)
        add(out, x, tt, 0.45); tt += d + 0.02
    return out
def kiss():
    x = hp(rng.standard_normal(int(0.06 * SR)), 2000) * np.exp(-t_(0.06) * 60)
    y = chirp(1400, 700, 0.12) * np.exp(-t_(0.12) * 25)
    out = np.zeros(int(0.2 * SR)); add(out, x, 0, 0.8); add(out, y, 0.03, 0.5); return out
def chime():
    out = np.zeros(int(1.5 * SR))
    for k, m in enumerate([72, 76, 79, 84]):
        x = (np.sin(2 * np.pi * note(m) * t_(1.2)) + 0.25 * np.sin(2 * np.pi * note(m) * 3 * t_(1.2))) * np.exp(-t_(1.2) * 3.5)
        add(out, x, k * 0.09, 0.4)
    return out
def bubbles(d=2.0, n=10):
    out = np.zeros(int(d * SR))
    for k in range(n):
        f = rng.uniform(500, 1100)
        x = chirp(f, f * 2.2, 0.05) * np.exp(-t_(0.05) * 50); add(out, x, rng.uniform(0, d - 0.1), 0.3)
    return out

# name -> (make(duration or None), gain). Keep in step with SOUNDS in render.py and the kit README.
SOUNDS = {"whoosh": (lambda d: whoosh(), 0.55), "swish": (lambda d: whoosh(0.18, 500, 4000), 0.35), "pop": (lambda d: pop(), 0.7),
          "pop2": (lambda d: pop(950, 380), 0.6), "boing": (lambda d: boing(), 0.5), "impact": (lambda d: impact(), 0.9),
          "sparkle": (lambda d: sparkle(), 0.35), "buzzer": (lambda d: buzzer(), 0.45), "chomp": (lambda d: chomp(), 0.55),
          "zip": (lambda d: zip_(), 0.6), "ticks": (lambda d: ticks(d or 1.0), 0.45), "burst": (lambda d: burst(), 0.7),
          "flip": (lambda d: flip(), 0.6), "trombone": (lambda d: trombone(), 0.75), "kiss": (lambda d: kiss(), 0.7),
          "chime": (lambda d: chime(), 0.45), "bubbles": (lambda d: bubbles(d or 2.0, 9), 0.4)}

def mix(cues, voice_path, music_mode, bpm, ambience):
    dur = float(cues["duration"]); n = int(dur * SR)
    music = np.zeros(n)
    if music_mode == "synth": music = synth_music(dur, bpm)
    elif music_mode != "none": music = track_music(music_mode, dur)
    sfx = np.zeros(n)
    for ev in cues["events"]:
        t, name = ev[0], ev[1]
        if name not in SOUNDS: raise SystemExit(f"unknown sound {name!r}; known: {', '.join(SOUNDS)}")
        make, g = SOUNDS[name]; add(sfx, make(ev[2] if len(ev) > 2 else None), t, g)
    if ambience == "bubbles":                                    # sparse bubbles in water scenes
        for t0 in np.arange(3.0, dur - 2, 3.1): add(sfx, bubbles(1.0, 3), t0 + rng.uniform(0, 1), 0.25)
    vo, vsr = sf.read(voice_path, dtype="float64")
    if vo.ndim > 1: vo = vo.mean(1)
    vo = resample_poly(vo, SR // math.gcd(SR, vsr), vsr // math.gcd(SR, vsr))
    vo = hp(vo, 70)
    voice = np.zeros(n); add(voice, vo, 0.0, 1.0)
    # duck the music under the voice: smooth RMS envelope of the narration
    win = int(0.05 * SR); rms = np.sqrt(np.convolve(voice ** 2, np.ones(win) / win, mode="same"))
    active = np.clip(rms / (rms.max() * 0.15), 0, 1)
    k = int(0.25 * SR); active = np.convolve(active, np.ones(k) / k, mode="same")
    def db(x): return 10 ** (x / 20)
    def rmsdb(x): return 20 * np.log10(np.sqrt(np.mean(x[np.abs(x) > 1e-4] ** 2)) + 1e-9) if (np.abs(x) > 1e-4).any() else -120.0
    v_level = rmsdb(voice)
    if music.any(): music *= db(v_level - rmsdb(music)) * (db(-7) * (1 - active * (1 - db(-3))))   # ~-7 dB bed, a further -3 dB under speech
    if sfx.any(): sfx *= db(v_level - rmsdb(sfx)) * db(-7)
    out = voice + music + sfx
    out /= max(1e-9, np.abs(out).max()) / 0.9
    fade = int(0.6 * SR); out[-fade:] *= np.linspace(1, 0, fade)
    under = round(v_level - rmsdb(music[active > 0.8]), 1) if music.any() and (active > 0.8).any() else None
    return out, under

def run(cmd): return subprocess.run(cmd, capture_output=True, text=True)

def loudnorm(src, dst, trim_db=0.0):
    """One-pass loudnorm to LOUDNESS: its limiter tames the effect transients that a linear gain would clip."""
    af = f"loudnorm=I={LOUDNESS['I']}:TP={LOUDNESS['TP']}:LRA={LOUDNESS['LRA']}"
    if trim_db: af += f",volume={trim_db}dB"
    r = run(["ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", src, "-af", af, "-ar", str(SR), dst])
    if r.returncode: raise SystemExit(r.stderr[-800:])

def meter(path):
    """Integrated loudness and true peak as heard in the final file."""
    err = run(["ffmpeg", "-hide_banner", "-nostats", "-nostdin", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr
    summary = err[err.rfind("Summary:"):]
    i = re.search(r"I:\s+(-?[\d.]+) LUFS", summary); p = re.search(r"Peak:\s+(-?[\d.]+) dBFS", summary)
    return {"integratedLufs": float(i.group(1)) if i else None, "truePeakDbtp": float(p.group(1)) if p else None}

def mux(video, audio, out):
    r = run(["ffmpeg", "-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-i", video, "-i", audio, "-map", "0:v", "-map", "1:a",
             "-c:v", "libx264", "-crf", "21", "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-shortest", out])
    if r.returncode: raise SystemExit(r.stderr[-800:])

def main():
    ap = argparse.ArgumentParser(description="Music, sound effects and the final mix for a render.py video.")
    ap.add_argument("cues"); ap.add_argument("--voice", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--video", help="the silent render.py video; with it, --out is the finished MP4")
    ap.add_argument("--music", help="synth, none, or a music file you hold the rights to"); ap.add_argument("--bpm", type=float)
    ap.add_argument("--ambience", choices=["bubbles", "none"])
    args = ap.parse_args()
    if not shutil.which("ffmpeg"): print("ffmpeg is not on PATH; install FFmpeg (see the kit README)", file=sys.stderr); sys.exit(3)
    cues = json.load(open(args.cues))
    plan_music = cues.get("music", {"bpm": 120})
    music = args.music or ("none" if plan_music == "none" else plan_music.get("file", "synth"))
    bpm = args.bpm or (plan_music.get("bpm", 120) if isinstance(plan_music, dict) else 120)
    out, under = mix(cues, args.voice, music, bpm, args.ambience or cues.get("ambience", "none"))
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    base = os.path.splitext(args.out)[0]
    raw = base + ".mix.wav"
    sf.write(raw, np.stack([out, out], 1).astype(np.float32), SR)
    norm = base + ".norm.wav" if args.video else args.out
    loudnorm(raw, norm)
    qa = {"target": LOUDNESS, "durationS": cues["duration"], "music": music, "voiceOverMusicDb": under}
    if args.video:
        mux(args.video, norm, args.out); m = meter(args.out)
        if m["truePeakDbtp"] is not None and m["truePeakDbtp"] > LOUDNESS["TP"] + 0.5:
            # AAC can lift the true peak above what loudnorm allowed: trim once and measure again.
            qa["firstPass"] = m
            loudnorm(raw, norm, trim_db=round(LOUDNESS["TP"] - m["truePeakDbtp"], 2)); mux(args.video, norm, args.out); m = meter(args.out)
    else:
        m = meter(args.out)
    qa.update(m)
    qa["ok"] = m["integratedLufs"] is not None and abs(m["integratedLufs"] - LOUDNESS["I"]) <= 1.0 and m["truePeakDbtp"] <= LOUDNESS["TP"] + 0.5
    json.dump(qa, open(base + ".qa.json", "w"), indent=1)
    print(f"{args.out}: {m['integratedLufs']} LUFS, true peak {m['truePeakDbtp']} dBTP"
          + (f", voice about {under} dB over the music" if under is not None else "") + ("" if qa["ok"] else "  CHECK: loudness is off target"))

if __name__ == "__main__":
    main()
