# One narration file from the script lines: spoken locally with Kokoro, or joined from per-line clips.
#
#   tts.py --lines script.txt --out audio/vo.wav [--models ~/.vixel/kokoro] [--voice af_heart] [--speed 1.1]
#   tts.py --clips line01.m4a line02.m4a ... --out audio/vo.wav      (Vixel narration lines, in script order)
#
# Each line is trimmed of near-silence and joined with --gap seconds (0.22). script.txt holds one narration
# line per line (blank lines and # comments are skipped). Also writes audio/vo_lines.json with each line's
# start and end. Exit code 3 when the Kokoro model files or FFmpeg are missing.
import argparse, json, os, shutil, subprocess, sys
import numpy as np, soundfile as sf

MODEL_FILES = {"kokoro-v1.0.onnx": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
               "voices-v1.0.bin": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"}
CLIP_SR = 24000

def read_lines(path):
    return [l.strip() for l in open(path, encoding="utf-8") if l.strip() and not l.lstrip().startswith("#")]

def trim(samples, sr):
    """Drop leading/trailing near-silence, keeping 30 ms before and 60 ms after the speech."""
    idx = np.where(np.abs(samples) > 0.01)[0]
    return samples[max(0, idx[0] - int(0.03 * sr)): idx[-1] + int(0.06 * sr)] if len(idx) else samples

def kokoro_lines(args):
    missing = [f for f in MODEL_FILES if not os.path.exists(os.path.join(args.models, f))]
    if missing:
        print(f"Kokoro model files are missing from {args.models} (about 340 MB). With the creator's OK, download them:", file=sys.stderr)
        for f in missing: print(f"  curl -L --retry 4 --retry-all-errors -o \"{os.path.join(args.models, f)}\" {MODEL_FILES[f]}", file=sys.stderr)
        sys.exit(3)
    from kokoro_onnx import Kokoro
    lines = read_lines(args.lines)
    if not lines: raise SystemExit(f"{args.lines} has no narration lines")
    k = Kokoro(os.path.join(args.models, "kokoro-v1.0.onnx"), os.path.join(args.models, "voices-v1.0.bin"))
    for line in lines:
        samples, sr = k.create(line, voice=args.voice, speed=args.speed, lang=args.lang)
        yield line, samples, sr

def clip_lines(args):
    if not shutil.which("ffmpeg"): print("ffmpeg is not on PATH; install FFmpeg (see the kit README)", file=sys.stderr); sys.exit(3)
    for path in args.clips:
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(CLIP_SR), "-"], capture_output=True, check=True).stdout
        yield os.path.basename(path), np.frombuffer(raw, dtype=np.float32), CLIP_SR

def main():
    ap = argparse.ArgumentParser(description="Make the narration file for words.py and sound.py.")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--lines", help="script.txt, spoken with Kokoro"); src.add_argument("--clips", nargs="+", help="narration clips in script order")
    ap.add_argument("--out", required=True)
    ap.add_argument("--models", default=os.path.join(os.path.expanduser("~"), ".vixel", "kokoro"))
    ap.add_argument("--voice", default="af_heart"); ap.add_argument("--speed", type=float, default=1.1)
    ap.add_argument("--gap", type=float, default=0.22); ap.add_argument("--lang", default="en-us")
    args = ap.parse_args()
    sr = None; chunks = []; marks = []; t = 0.0
    items = list(kokoro_lines(args) if args.lines else clip_lines(args))
    for i, (line, samples, sr) in enumerate(items):
        samples = trim(samples, sr)
        marks.append({"line": i, "text": line, "start": round(t, 3), "end": round(t + len(samples) / sr, 3)})
        chunks.append(samples); t += len(samples) / sr
        if i < len(items) - 1:
            chunks.append(np.zeros(int(args.gap * sr), dtype=samples.dtype)); t += args.gap
    audio = np.concatenate(chunks)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    sf.write(args.out, audio, sr)
    json.dump(marks, open(os.path.splitext(args.out)[0] + "_lines.json", "w"), indent=1)
    print("narration", args.out, round(len(audio) / sr, 2), "s,", len(items), "lines, sr", sr)

if __name__ == "__main__":
    main()
