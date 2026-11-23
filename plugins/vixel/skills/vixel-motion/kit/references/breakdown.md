# Breaking down a reference video

For a trend remake: the creator brings a video whose format works, and the new
one keeps its structure, timing and motion with the creator's own characters,
places and words. Use only a video the creator may use. Keep its rhythm, never
another creator's face, voice, footage, logo or show name.

The breakdown is a small folder next to the project, written so the next agent
can read it in layers: `VIDEO.md` (what it is and how to remake it, under a
page), `timeline.md` (one line per shot), and `frames/` (only what you looked
at). The idea of one Markdown package per video comes from rea-video's VIDEO.md.

## 1. Measure

```
ffprobe -v error -show_entries stream=width,height,r_frame_rate,nb_frames -show_entries format=duration ref.mp4
HF measure cuts ref.mp4 --json
HF measure events ref.mp4 --json
ffmpeg -i ref.mp4 -vf "fps=2,scale=180:-1,tile=8x4" -frames:v 1 frames/overview.jpg
```

- The new project uses the reference's size, frame rate and length. Write
  times as frame / fps rounded down.
- `measure cuts` lists hard cuts, including jump cuts inside one take, and
  keeps flashes, whips and fast moves apart as `not_cuts`. A wipe or a flood
  is not a cut: read the frames around every event.
- Look at consecutive frames wherever something changes (each cut, entrance,
  exit and transition, a few frames either side):
  `HF measure frames ref.mp4 --help` lists the ways to pull them.

## 2. One row per shot

`timeline.md` has one line per shot. Mark a value you inferred with `~`; a
value without it is visible or measured.

```
| # | start-end | story | seen | text on screen | motion | made~ | remake |
| 1 | 0.000-1.833 | hook | shocked mascot pops up over a reef | "This dad is pregnant." word by word | spring up, squash | ~still + code | Vixel pose + plate; title in code |
```

- **story**: the shot's job (hook, setup, fact, turn, payoff, call to action).
- **seen**: what a stranger would name, every object.
- **text on screen**: the exact words, their position, size as a share of the
  frame height, colour and entrance; captions separately from titles.
- **motion**: the hero move and its ease, the camera, the transition out.
- **made~**: how the picture was made: `code` (text, cards, charts, UI),
  `still` (one image with a pan or zoom), `2d` (drawn animation), `ai_video`,
  `live` (filmed), `screen` (a recording). One shot can be `ai_video + code
  text`.
- **remake**: the route below.

## 3. Remake routes

| made~ | Route |
| --- | --- |
| `code` | Rebuild in HyperFrames: same layout, sizes, timing and eases, the creator's words |
| `still` | One Vixel plate or pose, the same measured push or pan in code |
| `2d` | Vixel poses for each key pose, moved and squashed in code between them |
| `ai_video` | A Shot video in the Work: `film_v1_production_quote` from the shot's first frame and direction |
| `live` | The creator films it, or a Vixel Shot video when a drawn version fits the remake |
| `screen` | The creator records their own screen |
| a trending dance with a pet, the creator's own character or the creator | `film_v1_remake_quote` with the reel link and one picture, when the connection lists it |

## 4. VIDEO.md

Under a page: what the video is about and why its format works (the hook, the
turn, the payoff); its length, shot count and average shot length; the share
of each `made~`; the sound (voice, music tempo, effects on actions); the
remake summary (which pictures Vixel makes, which shots are code, which need
video, what the creator must film or license); and the points you are not
sure of. List the files under it with what each holds.

## 5. Check against the original

Before the delivery render, compare a few moments side by side:
`HF snapshot --at 0.5,2,4.5 --against ref.mp4` writes a render | reference
sheet. Fix a missing cut, a wrong time, size or colour; the remake should match
the reference's rhythm, not its people or pictures.
