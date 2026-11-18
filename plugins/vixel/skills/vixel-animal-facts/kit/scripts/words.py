# Word timestamps for the narration with faster-whisper, plus a word-for-word check against the script.
#
#   words.py audio/vo.wav --out audio/words.json [--script script.txt] [--model small.en] [--cache DIR]
#
# Prints every word with its index (the wN the shot plan uses) and start time. The audio is passed as a
# 16 kHz array: newer PyAV versions fail on file input.
import argparse, difflib, json, os, re, sys
from math import gcd

def norm(w): return re.sub(r"[^\w']", "", w.lower().replace("’", "'"))

UNITS = {w: i for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split())}
TENS = {w: 10 * (i + 2) for i, w in enumerate("twenty thirty forty fifty sixty seventy eighty ninety".split())}
SCALES = {"hundred": 100, "thousand": 1000, "million": 1000000}

def numberize(tokens):
    """Spelled-out numbers as digits, so "two thousand" in the script matches "2,000" in the transcript."""
    out, i = [], 0
    while i < len(tokens):
        if tokens[i] not in UNITS and tokens[i] not in TENS:
            out.append(tokens[i]); i += 1; continue
        total = cur = 0
        while i < len(tokens) and (tokens[i] in UNITS or tokens[i] in TENS or tokens[i] in SCALES):
            t = tokens[i]
            if t in SCALES:
                cur = max(cur, 1) * SCALES[t]
                if SCALES[t] > 100: total += cur; cur = 0
            else: cur += UNITS.get(t, TENS.get(t, 0))
            i += 1
        out.append(str(total + cur))
    return out

def spoken_tokens(words):
    """Transcript tokens with "2" ",000" joined back into one number."""
    out = []
    for w in words:
        if w["w"].startswith(",") and out: out[-1] += w["w"]
        else: out.append(w["w"])
    return [norm(t) for t in out if norm(t)]

def main():
    ap = argparse.ArgumentParser(description="Word timestamps for the narration.")
    ap.add_argument("audio"); ap.add_argument("--out", required=True); ap.add_argument("--script")
    ap.add_argument("--model", default="small.en"); ap.add_argument("--language", default="en")
    ap.add_argument("--cache", default=os.path.join(os.path.expanduser("~"), ".vixel", "whisper-models"))
    args = ap.parse_args()
    import soundfile as sf
    from scipy.signal import resample_poly
    from faster_whisper import WhisperModel
    m = WhisperModel(args.model, device="cpu", compute_type="int8", download_root=args.cache)
    x, sr = sf.read(args.audio, dtype="float32")
    x = x if x.ndim == 1 else x.mean(1)
    g = gcd(sr, 16000); x = resample_poly(x, 16000 // g, sr // g).astype("float32")
    segs, _ = m.transcribe(x, word_timestamps=True, beam_size=5, language=args.language)
    words = []
    for s in segs:
        for w in s.words:
            words.append({"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 3)})
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    json.dump(words, open(args.out, "w"), indent=0)
    print(len(words), "words ->", args.out)
    for i in range(0, len(words), 6):
        print("  " + "  ".join(f"w{j}={words[j]['w']}@{words[j]['s']:.2f}" for j in range(i, min(i + 6, len(words)))))
    if args.script:
        script = [norm(t) for l in open(args.script, encoding="utf-8") if l.strip() and not l.lstrip().startswith("#") for t in l.split()]
        script = numberize([t for t in script if t])
        heard = numberize(spoken_tokens(words))
        diffs = [op for op in difflib.SequenceMatcher(a=script, b=heard, autojunk=False).get_opcodes() if op[0] != "equal"]
        if not diffs:
            print("transcript matches the script word for word"); return
        print(f"{len(diffs)} difference(s) between the script and what was heard:")
        for tag, a0, a1, b0, b1 in diffs:
            print(f"  {tag}: script {' '.join(script[a0:a1]) or '-'!r} / heard {' '.join(heard[b0:b1]) or '-'!r}")
        print("Listen to those lines. Retake the voice, or fix the script, before you time the shots.")
        sys.exit(1)

if __name__ == "__main__":
    main()
