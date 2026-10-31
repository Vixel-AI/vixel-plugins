"""Word timestamps for the Vixel finishing kit, called by transcribe.mjs. Prints one JSON object.
Usage: python3 -I transcribe.py <model> <language|auto> <cache-dir> <audio.wav>...
Greedy decoding with repeated n-grams blocked keeps laughter and giggles from looping into long nonsense.
The WAVs (16 kHz mono 16-bit, written by transcribe.mjs) are read here, so faster-whisper never calls PyAV's changing open().
"""
import json
import os
import sys
import wave

import numpy as np
from faster_whisper import WhisperModel


def load(path):
    with wave.open(path, "rb") as w:
        if (w.getnchannels(), w.getsampwidth(), w.getframerate()) != (1, 2, 16000):
            raise SystemExit(f"{path}: expected 16 kHz mono 16-bit WAV")
        frames = w.readframes(w.getnframes())
    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


def main():
    model_name, language, cache = sys.argv[1], sys.argv[2], sys.argv[3]
    model = WhisperModel(model_name, device="cpu", compute_type="int8", cpu_threads=min(4, os.cpu_count() or 1), download_root=cache)
    out = {}
    for path in sys.argv[4:]:
        segments, info = model.transcribe(
            load(path), language=None if language == "auto" else language, word_timestamps=True, beam_size=1, temperature=0.0,
            condition_on_previous_text=False, no_repeat_ngram_size=3, repetition_penalty=1.3, vad_filter=False)
        words = [{"w": w.word, "s": round(w.start, 3), "e": round(w.end, 3), "p": round(w.probability, 3)}
                 for segment in segments for w in (segment.words or [])]
        out[path] = {"language": info.language, "words": words}
    json.dump(out, sys.stdout, ensure_ascii=False)


main()
