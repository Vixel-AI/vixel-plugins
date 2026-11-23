# Vixel motion kit

Local tools for a code-animated motion video built from the pictures Vixel made
in a Work: a checked download of the accepted pictures, cutouts and plates, an
example HyperFrames project, the motion craft and a shot-by-shot breakdown
method for reference videos. HyperFrames renders HTML to MP4 by seeking a
paused timeline frame by frame, so a render is repeatable. Nothing here changes
a Work, spends credits or posts anything.

`KIT` is this folder (`<vixel-motion Skill folder>/kit`).

## Prerequisites

Node.js 22 or later, FFmpeg with FFprobe, and Python 3.10 or later with venv.
Check with `node --version`, `ffmpeg -version` and `python3 --version`.

| System | Install |
| --- | --- |
| macOS | `brew install node ffmpeg python@3.12` |
| Windows | `winget install OpenJS.NodeJS.LTS Gyan.FFmpeg Python.Python.3.12`, then open a new terminal. |
| Debian/Ubuntu | `sudo apt install nodejs ffmpeg python3 python3-venv` (Node.js 22 from nodejs.org if the system one is older) |

**HyperFrames.** `HF` is `npx -y hyperframes@0.9.26` (in a shell, define it as a
function: `HF() { npx -y hyperframes@0.9.26 "$@"; }`). Pin that exact version:
the CLI releases several times a day, and a floating install changes behaviour
under you. Its first render or check downloads a headless Chrome, about 200 MB,
into `~/.cache/hyperframes`. Set `HYPERFRAMES_NO_TELEMETRY=1` in the environment
of every HyperFrames command (`export HYPERFRAMES_NO_TELEMETRY=1` once per
shell), pass `--skip-skills` to `init`, and leave its sign-in, cloud, sharing,
publishing, templates and media generation alone: Vixel makes the media.

**Python for `prep.py`.** The kit runs in its own environment at
`~/.vixel/motion` (Windows `%USERPROFILE%\.vixel\motion`), about 150 MB:

```
python3 -m venv ~/.vixel/motion
~/.vixel/motion/bin/pip install -r KIT/requirements.txt
```

`PY` below is that environment's `python`. The animal-facts kit's environment
(`~/.vixel/animal-facts`) works too.

## Steps

| Step | Command |
| --- | --- |
| Download the accepted pictures and check them | `node KIT/scripts/fetch.mjs media.json --out src` |
| Split a character sheet into views | `PY KIT/scripts/prep.py look src/look_dad.png --out assets --views _,dad_front,dad_side,_` |
| Crop poses and props | `PY KIT/scripts/prep.py cutout src/pose_*.png --out assets` |
| Cover-fit backgrounds | `PY KIT/scripts/prep.py plate src/bg_*.png --out assets` |
| Points for arrows and rings to aim at | `PY KIT/scripts/prep.py anchors assets --region belly=236-255,206-239,161-214` |
| Start a project | copy `KIT/examples/seahorse-fact/`, or `HF init my-video --skip-skills --resolution portrait --non-interactive` |
| Lint while writing | `HF lint` |
| The gate | `HF check --json` |
| See the film | `HF snapshot --review` (beat sheet, a strip around every cut, phone-width sheet) |
| Local voice | `HF tts script.txt -o assets/vo.wav --voice af_heart` |
| Word timing | `HF transcribe assets/vo.wav --engine whisper --model small.en --json` |
| Where sound lands | `HF audio out/final.mp4 --quality local --json` |
| Render | `HF render --quality looks -o out/final.mp4` (`draft` while iterating) |
| Probe the file | `ffprobe -v error -show_entries stream=width,height,r_frame_rate,nb_frames -show_entries format=duration out/final.mp4` |
| Contact sheet | `ffmpeg -i out/final.mp4 -vf "fps=2,scale=180:-1,tile=8x2" -frames:v 1 out/sheet.jpg` |
| Loudness, when there is sound | `ffmpeg -i out/final.mp4 -c:v copy -af loudnorm=I=-14:TP=-1.5:LRA=11 out/final_mix.mp4` |

- `media.json` is `{"files": [{"name": "look_dad.png", "url": "https://...",
  "sha256": "<64 hex>"}]}`, one entry per accepted picture, with the url and
  checksum the Job reported (`KIT/examples/seahorse-fact/media.example.json`).
  `fetch.mjs` keeps files that already match and exits 1 when any download
  fails or differs.
- `prep.py` writes into an existing folder: create `assets/` first. A picture
  on a flat colour is keyed out by flooding from the border; one that is
  already transparent is only cropped. `look` splits on transparent rows, then
  columns, so a sheet can be one row or a grid (a 9:16 Work returns tall sheets,
  often 2x2): name every view it finds left to right, row by row, `_` to skip one.
- The first `tts` and `transcribe` runs download their models; ask first.
  `--engine whisper` keeps transcription on this computer.

## Project shape

```
index.html            root: the film's length, size, palette; one host per scene
compositions/*.html   one scene each, everything inside <template>
assets/               plates, cutouts, fonts/Nunito-Black.ttf, audio
STORYBOARD.md         the brief: goal, look numbers, shots, pictures, facts
media.json            the accepted Work pictures and their checksums
```

## Composition rules

These are the rules the renderer depends on; `HF check` reports most breaks.

1. The root `#root` in `index.html` has `data-composition-id="main"`,
   `data-start="0"`, `data-duration` (the film's length in seconds),
   `data-width` and `data-height`. Overrun is cut; an early end holds the last
   frame.
2. Each scene host in the root has `data-composition-src`, `data-start`,
   `data-duration`, `data-track-index`, `data-track-kind="graphics"` and the
   same size. Its `id`, its `data-composition-id`, the scene file's root
   `data-composition-id` and the scene's `window.__timelines["<id>"]` key are
   the same id, or the render waits and shows static frames.
3. A scene file puts its `<style>`, markup and `<script>` inside `<template>`
   and styles its root as `#root` with `position: absolute; inset: 0`. Prefix
   every other id with the scene's id (`#hook-title`): ids are unique across
   the assembled page.
4. Each scene builds one `gsap.timeline({ paused: true })` and registers it
   after its last tween. Never play, pause or seek it, and never add one
   scene's timeline to another.
5. Use `fromTo`, not `from`. A second `fromTo` on the same element and
   property gets `immediateRender: false`, or its start values show before the
   first tween runs.
6. Everything visible is a function of timeline time: no `Date.now()`, no
   unseeded `Math.random()`, no timers, no `repeat: -1`, no network fetches. A
   counter is a tween of a plain object whose `onUpdate` writes the text
   (`KIT/examples/seahorse-fact/compositions/count.html`).
7. A timed element (`class="clip"` with `data-start` and `data-duration`)
   shows over `[start, start + duration)`. Never tween `display`, `visibility`
   or `autoAlpha` on it; animate a child. Animate transforms, not
   `left`/`top`/`width`/`height`, and set no CSS `transform` on an element GSAP
   transforms.
8. Paths are relative and start with `assets/`. Fonts other than the bundled
   ones need `@font-face` in the file that uses them: the kit ships
   `fonts/Nunito-Black.ttf` (SIL OFL, `fonts/Nunito-OFL.txt`).
9. A character or plate that is meant to leave the frame gets
   `data-layout-allow-overflow`, so the layout audit reads it as intended.
10. Every `<audio>` has an `id`, or it is left out of the mix.

## Credits

The method borrows structure, not files, from these open-source projects:
HyperFrames (npm `hyperframes`, Apache-2.0) for the render contract, the
review loop and measured motion defaults;
[iart-ai/motion-skills](https://github.com/iart-ai/motion-skills) (MIT) for the
script-to-storyboard pipeline and the deliver-and-verify loop; and
[JuneYaooo/rea-video](https://github.com/JuneYaooo/rea-video) (Apache-2.0) for
the shot-by-shot breakdown of a reference video. No file of theirs is copied
into this kit. `prep.py` is the animal-facts kit's, unchanged. GSAP loads from
its CDN under its own license.
