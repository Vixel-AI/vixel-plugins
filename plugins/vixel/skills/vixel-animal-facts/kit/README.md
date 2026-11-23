# Vixel animal-facts kit

Local tools for a code-animated animal-facts short: cutouts and plates from
the pictures Vixel made in the Work, narration, word timing, a renderer driven
by a JSON shot plan, and a synthesised music and sound-effect mix at -14 LUFS.
Every frame is a pure function of time, so a render is repeatable. No script
changes a Work, spends credits or posts anything.

`KIT` is this folder (`<vixel-animal-facts Skill folder>/kit`).

## Prerequisites

FFmpeg with FFprobe, and Python 3.10 or later with venv. Check with
`ffmpeg -version` and `python3 --version`.

| System | Install |
| --- | --- |
| macOS | `brew install ffmpeg python@3.12` |
| Windows | `winget install Gyan.FFmpeg Python.Python.3.12`, then open a new terminal. |
| Debian/Ubuntu | `sudo apt install ffmpeg python3 python3-venv` |

The kit runs in its own Python environment at `~/.vixel/animal-facts`
(Windows `%USERPROFILE%\.vixel\animal-facts`), about 400 MB, with no sudo and
nothing else changed:

```
python3 -m venv ~/.vixel/animal-facts
~/.vixel/animal-facts/bin/pip install -r KIT/requirements.txt
```

On Windows use `py -3.12 -m venv %USERPROFILE%\.vixel\animal-facts` and
`%USERPROFILE%\.vixel\animal-facts\Scripts\pip`. If pip finds no
`onnxruntime` wheel for your Python, build the environment with Python 3.12.
`PY` below is that environment's `python`.

Two models download on first use, each only with the creator's OK:

- The local voice, Kokoro v1.0 (about 340 MB): `tts.py` prints the two curl
  commands that put it in `~/.vixel/kokoro`. Not needed with Vixel narration.
- The speech model for word timing, faster-whisper `small.en` (about 470 MB):
  `words.py` downloads it into `~/.vixel/whisper-models` on its first run.

## Steps

| Step | Command |
| --- | --- |
| Split a character sheet into views | `PY KIT/scripts/prep.py look src/look_dad.png --out cut --views _,dad_front,dad_side,_` |
| Crop pose frames | `PY KIT/scripts/prep.py cutout src/pose_*.png --out cut` |
| Cover-fit backgrounds | `PY KIT/scripts/prep.py plate src/bg_*.png --out cut` |
| Anchors for props to aim at | `PY KIT/scripts/prep.py anchors cut --region belly=236-255,206-239,161-214` |
| Local voice (Kokoro) | `PY KIT/scripts/tts.py --lines script.txt --out audio/vo.wav` |
| Or join Vixel narration lines | `PY KIT/scripts/tts.py --clips audio/lines/* --out audio/vo.wav` |
| Word timing and the script check | `PY KIT/scripts/words.py audio/vo.wav --out audio/words.json --script script.txt` |
| Check the plan | `PY KIT/scripts/render.py plan.json --check` |
| Contact sheet | `PY KIT/scripts/render.py plan.json --sheet out/sheet.jpg` |
| Silent render and sound cues | `PY KIT/scripts/render.py plan.json --out out/video.mp4` |
| Music, effects, mix and mux | `PY KIT/scripts/sound.py out/video.sound.json --voice audio/vo.wav --video out/video.mp4 --out out/final.mp4` |

- `prep.py look` splits on fully transparent rows, then columns, so a sheet can
  be one row or a grid; name every view it finds left to right, row by row, and
  use `_` for the ones you do not need. A sheet or frame
  whose border is opaque gets its flat background keyed out first
  (`--key auto|always|never`). `cutout --names a,b,...` renames the outputs.
- `prep.py plate` crops to the frame plus a 12% margin (`--margin 1.12`) so the
  camera can drift, punch in and shake.
- `prep.py anchors` writes `cut/anchors.json`: for each cutout its size and
  fractional `left_tip`, `right_tip`, `top` and `bottom` points, plus each
  `--region name=R0-R1,G0-G1,B0-B1` colour box found in it (centre, size and
  top). `center` is always available.
- `tts.py` trims each line and joins them with `--gap` seconds (0.22). Kokoro
  options: `--voice` (default `af_heart`), `--speed` (1.1), `--lang` (`en-us`).
- `words.py` exits with code 1 when what it heard differs from the script
  (spelled-out numbers match digits). It prints each word as `wN`.
- `render.py` exit codes: 2 for a plan error (the message names the field), 3
  when FFmpeg is missing, 4 when media or the words file is missing. `--times
  0.3,1.0,...` picks contact-sheet times; otherwise the plan's `sheet` list, or
  two frames per shot. `--words`, `--cut` and `--font` override the plan.
- `sound.py` writes `FINAL.mix.wav`, `FINAL.qa.json` (loudness, true peak,
  voice over music) and the MP4: H.264 CRF 21, AAC 192 kbit/s. If AAC lifts the
  true peak more than 0.5 dB above -1.5 dBTP it trims once and measures again.
  `--music synth|none|<track you hold the rights to>`, `--bpm` and
  `--ambience bubbles|none` override the plan.

## The shot plan

`plan.json` describes the whole film; `examples/seahorse/plan.json` is a
complete episode (its finished film, one frame every 2 s, is
`examples/seahorse/contact-sheet.jpg`). Paths in it are relative to the plan file. Unknown keys are
errors, and any object may carry a `note` for your own comments.

Top level:

- `version` (1), `title`, `size` (`[1080, 1920]`), `fps` (30), `duration`
  (seconds, required).
- `words` (`audio/words.json`), `cut` (`cut`), `font` (the kit's Nunito Black).
- `captions`: `y` (1470), `size` (66), and `chunks`, a list of
  `[first word, last word, key word or null]` by word index. Without `chunks`
  the captions are 2-3 words broken at punctuation, the longest word in yellow.
- `specks`: `true` (rising bubbles), `false`, or `{"count": 40, "seed": 7}`.
- `tag`: when and where the "made with Vixel" end tag appears: `at`
  (`end-1.7`), `y` (1720), `size` (40).
- `music`: `{"bpm": 120}` for the synthesised bed, `{"file": "music/track.wav"}`
  for a track you hold the rights to, or `"none"`. `ambience`: `bubbles` or
  `none`.
- `sounds`: sounds not tied to a shot, `[time, name]`.
- `sheet`: contact-sheet times.
- `shots`: the shots in order; the first starts at 0 and each one ends where
  the next begins.

A shot has `at` (its start), `bg` (a plate: `reef` means `cut/bg_reef.jpg`),
`flip`, `id`, `layers`, `camera`, `sounds` (`[time, name]`, or
`[time, "ticks", until]` for a sound with a length) and `shakes`
(`[time, pixels]`, 24-34 for a hit). `camera` has `zoom` (1.04), `fx` and `fy`
(the point to zoom around, default the centre) and `punch`, a list of
`{"at", "amount"}` zoom punches (0.08-0.1 on key words).

**Times** are seconds, or a word's start: `"w12"`, `"w12+0.3"`, `"w39-0.25"`,
plus `"shot"` (this shot's start) and `"end"` (`"end-1.3"`). Put every cut,
pose change, title and sound on a word.

**Values** that move are a number or a motion object, added up:
`value` (a base), `ref` (a point's x or y, see below), `drift` (units per
second since the shot start, or `{"rate", "at"}`), `tween` (`{"by", "at",
"dur", "ease"}` or a list; ease `out_cubic`, `linear`, `back` or `in_out`),
`wave` (`{"amp", "freq", "phase", "at", "ramp"}`: a sine in radians per second,
optionally faded in over `ramp` seconds) and `set` (`[[time, value]]` steps).

**Points** are `[x, y]` in frame pixels (each a value) or
`{"layer": 0, "anchor": "belly", "dx": 25, "dy": 0, "bob": true}`: a sprite
layer of the same shot, optionally one of its anchors, offset, and moving with
its idle bob when `bob` is true.

Every layer has a `type`, and `at` and `until` (default: the shot's start and
end). Scene layers are drawn in list order, then the camera crops, then title
and counter layers go on top.

### `sprite`

A cutout from `cut/` with idle bob, tilt and tail sway. `image` and `h` (its
drawn height) and `x`, `y` (its centre) are required. `rot` (degrees),
`scale`, `flip`, `bob` (true), `sway` (tail sway in pixels, 9; 0 turns it off),
`alpha`, `squash` (times it squashes on a hit) and `trail`: speed lines while
its `x` tween runs, `{"dx", "dy", "h", "dir", "fade"}` (`dir` -1 when it moves
left, `fade` false keeps them at full strength).

### `prop`

Something moving on its own path: `draw` (`snail` or `shrimp`, drawn in code)
or `image` (a cutout, with `h`, `w` and `tint` `[r, g, b]`), with `x`, `y`,
`rot`, `scale` and `trail`.

### `throw`

A prop thrown again and again along an arc into a point, like food into a
mouth: `draw` or `image` (with `h`, `w`, `tint`), `scale`, `from` (`[x, y]`,
`y` may be null to start level with the target), `to` (a point), `start`,
`every` (0.32 s), `count`, `dur` (0.28 s), `arc` (160 px), `spin` (degrees),
`sound` (played on each landing) and `squash` (a sprite layer index that
squashes on each landing).

### `swarm`

A burst of tiny tinted copies of a cutout flying out of a point (babies, eggs,
seeds): `image`, `h` (78), `tints`, `from` (a point), `count` (190), `seed`,
`speed` and `angle` (`[low, high]`), `spin`, `scale` (`[low, high]`) and
`window` (0.9 s over which they leave).

### `ring`

The red marker ring that draws on around a point at `at`: `pos`, `rx`, `ry`,
`dur` (0.28 s) and `tilt` (-7 degrees).

### `arrow`

A curved red arrow that draws on at `at`: `from` and `to` (points), `bend`
(0.35) and `dur` (0.3 s).

### `starburst`

The yellow and white hit burst for 0.45 s at `at`: `pos` and `r` (105). Never
over a face.

### `hearts`

`mode` `burst`: `count` (7) hearts rising from `pos`, `stagger` (0.09 s),
`life` (1.4 s), `rise` (px per second), `spread` (px between them). `mode`
`rise`: hearts looping up across the frame: `count` (10), `left`, `span` and
`step` (their x), `y` (the start height), `rise`, `life`, `rate`, `stagger`,
`wiggle` and `fadeIn`. Both take `sizes` (used in turn) and `color`.

### `heart`

One big heart that springs open at `at`, the final move: `pos`, `size`,
`color`, `alpha` and `outline`.

### `sparkles`

White four-point sparkles that twinkle at `points` (`[[x, y], ...]`), with
`size` and `pulse`.

### `card`

A white checklist or calendar card popping in at `at`: `pos` (top-left
`[x, y]`), `width` (430) and `lines`, each `{"text", "color", "strike",
"then"}`: `strike` is when the line is struck through with an X stamp, `then`
is `[[time, new text]]`. Colours are `ink`, `red`, `white`, `yellow`, `pink`
or `[r, g, b]`.

### `title`

Big title words that spring in at `at` and wobble: `text` (`\n` for a second
line), `size` (110-175 px), `color` (`yellow`, `red`, `pink` or `white`) and
`y` (430).

### `counter`

A number on screen at `pos`: either `count` (`{"from", "to", "start", "end",
"curve"}`, counting up between two times) or `countOf` (the index of a `throw`
layer: how many have landed). `size`, `color`, `prefix` and `suffix`.

### Sounds

`whoosh` (entrances), `swish` (cuts), `pop` and `pop2` (titles, small hits),
`boing` (landings), `impact` (hits), `sparkle`, `buzzer` (an X), `chomp`,
`zip`, `ticks` (a counter, give it an `until`), `burst`, `flip` (a page or a
card), `trombone` (the shocking fact), `kiss`, `chime` (the end tag) and
`bubbles`. All are synthesised by `sound.py`; it uses no samples.

## Licenses

- Nunito Black: SIL Open Font License 1.1, see `fonts/Nunito-OFL.txt`. It is a
  static instance of the Nunito variable font.
- The music bed and sound effects are synthesised by `scripts/sound.py`.
- Python packages, Kokoro (Apache 2.0) and faster-whisper with its model
  (MIT) are installed separately, only when you run the commands above.
