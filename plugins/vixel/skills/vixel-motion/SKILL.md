---
name: vixel-motion
description: Make a short motion-graphics video with Vixel characters - an explainer or fact card (知识大赏), kinetic typography or a simple number and chart animation - or rebuild a reference video shot by shot for a trend remake. Vixel makes the on-model characters, cutouts and backgrounds inside a Work after the creator approves each quote; you animate them in HTML with the open-source HyperFrames renderer and render the MP4 on this computer. Use when the creator wants an explainer, a facts or knowledge video, animated text, a counter or chart, or their Vixel characters animated with code.
---

# Motion videos with Vixel

Vixel is the studio for pictures: every character, pose, prop and background is
made inside a Work, on-model, after the creator approves each quote. You are
the motion designer: you write the brief, lay the pictures out in HTML, animate
them with GSAP and render a deterministic MP4 with
[HyperFrames](https://www.npmjs.com/package/hyperframes) (Apache-2.0), which
seeks a paused timeline frame by frame, so every render of the same files is
identical. All words and numbers on screen are drawn by code, exactly.

`KIT` below is the `kit` folder beside this file:
`.agents/skills/vixel-motion/kit` after
`npx -y skills@1.7.0 add Vixel-AI/vixel-plugins --skill vixel-motion --yes`,
and `~/.claude/plugins/marketplaces/vixel/plugins/vixel/skills/vixel-motion/kit`
with the Claude Code plugin. `KIT/README.md` has the prerequisites, every
command and the composition rules; `KIT/examples/seahorse-fact/` is a finished
8-second project to copy from; `KIT/references/craft.md` is the motion craft and
`KIT/references/breakdown.md` the shot-by-shot breakdown of a reference video.
`HF` is `npx -y hyperframes@0.9.26`, always pinned to this version, with
`HYPERFRAMES_NO_TELEMETRY=1` set in the environment of every HyperFrames
command. `PY` is the Python of the kit's environment (`KIT/README.md`).
Work in one folder per video: `STORYBOARD.md`, `media.json`, `src/`, the
HyperFrames project (`index.html`, `compositions/`, `assets/`) and `out/`.

## Fixed rules

- Every picture and video is made inside a Work: `film_v1_production_quote`,
  the creator's approval, then `film_v1_production_generate`. There is no
  direct prompt-to-media tool. Do not call image, video or voice providers
  yourself, and do not use HyperFrames' own media generation, cloud render,
  templates, sign-in or any paid feature.
- Show the storyboard and the credit estimate before creating media or
  spending anything. Saving a Script is not approval.
- Submit only with a `maxCredits` the creator approved and a stable
  `idempotencyKey`. After a timeout or unknown outcome, look up the original
  request with `film_v1_request` instead of submitting again.
- Ask before installing anything (Node.js 22+, FFmpeg, the HyperFrames CLI and
  the Chrome it downloads, about 200 MB, the kit's Python environment, a voice
  or speech model) and say how big it is. Never ask for or paste passwords,
  tokens or keys. Run HyperFrames' `init` with `--skip-skills`; never run its
  `events`, `feedback`, `auth`, `skills`, `share`, `publish` or `cloud`.
- Facts and numbers must be true. Check each one, note its source in
  `STORYBOARD.md`, and leave out what you cannot check.
- A reference video is used only when the creator may use it. Take its
  structure, timing and pacing, never another creator's face, voice, footage,
  logo or show name; no other real people, celebrities or minors.
- Nothing is posted anywhere. Preparing a release in Vixel is not publishing.
  Keep a small "made with Vixel" tag at the end unless the creator's export is
  entitled to a clean one (`film_v1_export_manifest` says `cleanExportEntitled`).

## 1. Brief and estimate

Pick the kind with the creator:

| Kind | Length | Vixel makes | Code makes |
| --- | --- | --- | --- |
| Explainer or fact card (知识大赏) | 8-60 s, one idea | a host character's poses, one plate per place, props | titles, labels, counters, diagrams, transitions, captions |
| Kinetic typography | 5-30 s | one or two plates or a mascot pose | every word, its entrance, emphasis and hold |
| Number or chart animation | 6-30 s | a mascot that reacts, a plate | the axis, bars or dots, the count, the source line |
| Remake of a reference video | the reference's length | the new cast and places | the reference's text, layout and motion, rebuilt (`KIT/references/breakdown.md`) |

Then write `STORYBOARD.md` (copy `KIT/examples/seahorse-fact/STORYBOARD.md`):
the goal in one sentence; output 1080x1920 at 30 fps unless asked otherwise;
every look adjective as a number (ground, ink and accent hex, font and sizes,
outline width); the objects the viewer must recognise; eases by role; one row
per shot with its time, the one hero move, the words read, the sound and how
it hands off to the next shot; the banned defaults; the pictures to make, each
with the Element or Shot it belongs to; and every fact with its source.

Estimate credits by counting the pictures; pictures already accepted in one of
the creator's Works are free to reuse (`film_v1_projects`, `film_v1_project`).
The quotes are the price; read the balance with `film_v1_account`. Wait for the
creator's approval of the storyboard and the estimate.

## 2. Pictures in a Vixel Work

1. Reuse first: an existing Work's accepted looks, plates and poses need no
   new spend. Otherwise `film_v1_project_create` with `aspectRatio` `9:16`.
2. `film_v1_screenplay_create`: a short **Creative direction** block (audience,
   the one idea, art style, length, cast, places and "no words or numbers
   inside the pictures"), then scenes whose lines are the narration or the
   on-screen text. Show it, wait for approval and keep the `screenplayHash`
   from `film_v1_screenplay_get` as `approvedScreenplayHash`.
3. `film_v1_story_save`: each scene's `durationMs` must equal the sum of its
   beats' `durationMs` (beats are 3-15 s in 0.5 s steps).
4. `film_v1_production_plan`: one beat per line; characters described with one
   sentence that tells them apart, then the same style words every time;
   locations as empty scenes in those style words, with "no characters, no
   text"; a narrator only if the video is narrated.
5. Quote every picture first and show the total; submit each approved quote
   and follow its Job with `film_v1_job`. Make character looks first and check
   them, since poses copy their identity. Directions that cut out cleanly:
   - **Character look** (Element image): every view on a plain pure white
     background, fully separate, with generous white space between views.
   - **Background plate** (location look): "One single tall vertical 9:16
     portrait illustration filling the whole frame, not a sheet or grid. Empty
     scene, no characters, no text. Keep the middle and lower middle open."
   - **Pose or prop** (a Shot's opening image, `mediaKind` `image`): "Cutout
     plate for a motion-graphics edit, not a scene. <who or what> alone on a
     flat plain pure white background: no scenery, no ground, no shadow. Full
     body, centred, about 70% of the frame height, nothing touching the frame
     edges. <the pose>. Same style as their character sheet."
6. Write `media.json` with one entry per accepted picture: `name` (for example
   `pose_shocked.png`), `url` and `sha256`. Looks and plates use the Job
   asset's `publicUrl` and `sha256`; a pose uses the uncropped original,
   `asset.metadata.mediaContract.originalOutput` (its `publicUrl` and
   `sha256`). Then `node KIT/scripts/fetch.mjs media.json --out src` downloads
   them and stops on any checksum that differs.

## 3. Cutouts and plates

```
mkdir -p assets/fonts && cp KIT/fonts/Nunito-Black.ttf assets/fonts/
PY KIT/scripts/prep.py look src/look_dad.png --out assets --views _,dad_front,dad_side,_
PY KIT/scripts/prep.py cutout src/pose_shocked.png src/pose_proud.png --out assets --names dad_shocked,dad_proud
PY KIT/scripts/prep.py plate src/bg_reef.png src/bg_kelp.png --out assets
```

A picture that came back on a flat colour is keyed out; one that is already
transparent is only cropped. Plates are cover-fit to 1080x1920 with a 12%
margin for pushes and shakes. Look at every cutout before you use it.

## 4. Build the HyperFrames project

Copy `KIT/examples/seahorse-fact/` (or run `HF init <dir> --skip-skills
--resolution portrait --non-interactive`) and follow `KIT/README.md`
"Composition rules". In short: `index.html` mounts one scene per file in
`compositions/`; a scene's host, its root and its timeline key share one id;
every scene builds one paused GSAP timeline from `fromTo` tweens; nothing reads
the clock, random numbers or the network; media paths start with `assets/`.

Build from `KIT/references/craft.md`: one hero move per shot, arrivals on long
ease-outs, characters on springs with a squash when they land, titles that
land and hold still, every line held 0.5 s plus 0.3 s a word (the last line at
least 2 s), something new every 2-4 s, transitions caused by something on
screen, and every word inside the 9:16 safe area (288-1248 px down, 120-888 px
across).

## 5. Narration and sound (when the video has them)

- **Vixel narration**, when your tools include `film_v1_element_voice`: bind
  the narrator's voice, quote each Shot's `voice_over` line with `mediaKind`
  `audio`, place each reviewed line with `film_v1_timeline_patch` using its
  Job's `placeAs`, and download the lines from `film_v1_export_manifest`.
- **Local voice** otherwise, with the creator's OK (a model download on first
  use): `HF tts script.txt -o assets/vo.wav --voice af_heart` (`zf_xiaobei`
  for Mandarin).
- Word timing for captions and cues: `HF transcribe assets/vo.wav --engine
  whisper --model small.en --json` (`--model small --language zh` for Chinese,
  then split each sentence into short phrases by character count). Reveal each
  piece when the voice names it.
- Music only from a track the creator owns or has licensed, or none. Put voice
  and music on their own `<audio>` elements with ids, check where sound lands
  with `HF audio out/final.mp4 --quality local --json` (never `best`, which
  uploads the file) and bring the mix to -14 LUFS (`KIT/README.md`). You
  cannot hear it, so say so.

## 6. Check, look, render

```
HF lint
HF check --json
HF snapshot --review
HF render --quality looks -o out/final.mp4
```

Fix every `check` error and weigh every warning (`line_unread`,
`outside_safe_zone`, `first_frame_empty`, a repeated `fromTo` without
`immediateRender: false`). Open the three `--review` sheets: describe each beat
frame in one sentence as a stranger would, then fix what is unreadable, covered,
off-frame, static for more than 3 s or not what the storyboard says. Show the
creator the beat sheet before the delivery render. After rendering, confirm
with `ffprobe` that the file has the root's duration, size and frame rate, make
a contact sheet
(`ffmpeg -i out/final.mp4 -vf "fps=2,scale=180:-1,tile=8x2" -frames:v 1 out/sheet.jpg`)
and look at it.

## 7. From a reference video

For a trend remake, follow `KIT/references/breakdown.md`: list every cut, write
one row per shot (what is seen, the text, the motion, how it was made, and how
to remake it), then rebuild the code shots in HyperFrames and make the new
cast and places in the Work. A shot that needs generated video goes through
`film_v1_production_quote` like any other Work media; a trending dance with
the creator's pet, their character or the creator themselves goes through
`film_v1_remake_quote` when the connection lists it.

## 8. Report

Give the creator the MP4, the contact sheet and the beat sheet, the Work link
(`film_v1_handoff`), the credits the Jobs actually charged, the sources of
every fact, and anything you could not verify (sound is measured, not heard).
Save the final video to the Work as a prepared release
(`film_v1_release_upload_intent`, `film_v1_release_upload_finalize`,
`film_v1_release_create`) only when the creator asks. The creator posts it.
For the next video, keep `assets/`: the cutouts and plates can be reused, so
only new poses and places cost credits.

## Connect Vixel first

These steps need the `vixel` MCP tools. If they are missing, ask the creator
before changing their agent's configuration, then connect with browser sign-in
(no API key). The quickest way is to fetch and follow
<https://drama.vixelai.com/agent-setup.md>. By hand:

- Claude Code: `claude mcp add --transport http vixel https://drama.vixelai.com/api/mcp`,
  then `/mcp`, select `vixel` and choose Authenticate. With the Vixel plugin
  installed, only the `/mcp` step is needed.
- Codex: `codex mcp add vixel --url https://drama.vixelai.com/api/mcp`, then
  `codex mcp login vixel --scopes film.read,film.write,film.generate,offline_access`,
  and start a new task.
- Cursor and other clients: add the MCP server URL
  `https://drama.vixelai.com/api/mcp` and connect, or follow
  <https://drama.vixelai.com/creator/mcp>.

The creator approves access in the browser.
