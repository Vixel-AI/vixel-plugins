---
name: vixel-animal-facts
description: Make a 30-35 second cartoon animal-facts short for a faceless facts channel. Vixel makes the on-model characters, backgrounds and pose cutouts inside a Work; this Skill's kit animates them with captions, titles, drawn props, music and sound effects, timed to the narration's words. Use when the user asks for an animal-facts video, the next episode of their facts channel, or pastes the Vixel animal-facts prompt.
---

# Animal-facts shorts with Vixel

One episode is a 1080x1920 flat 2D cartoon, 30-35 s long: a hook question, a
name card, one fact per scene and a punchline. Vixel makes every picture inside
a Work (character looks, empty backgrounds and pose cutouts) after the creator
approves each quote. This Skill's `kit/` folder does the rest on this computer:
cutouts, narration timing, animation, captions, titles, props, music, sound
effects and a -14 LUFS mix. Run the kit; do not rewrite the renderer. If
something is missing, say so and keep the plan within what the kit supports.

`KIT` below is the `kit` folder beside this file:
`.agents/skills/vixel-animal-facts/kit` after
`npx -y skills@1.7.0 add Vixel-AI/vixel-plugins --skill vixel-animal-facts --yes`,
and `~/.claude/plugins/marketplaces/vixel/plugins/vixel/skills/vixel-animal-facts/kit`
with the Claude Code plugin. `KIT/README.md` has the prerequisites, every
command and the shot plan format; `KIT/examples/seahorse/` is a finished
episode plan to copy from.
`PY` is the Python of the kit's own environment, `~/.vixel/animal-facts/bin/python`
(Windows `%USERPROFILE%\.vixel\animal-facts\Scripts\python.exe`); the README sets it up.
Work in one folder per episode: `plan.json`, `script.txt`, `src/`, `cut/`, `audio/`
and `out/`.

## Fixed rules

- Every picture is made inside a Work: `film_v1_production_quote`, the
  creator's approval, then `film_v1_production_generate`.
  There is no direct prompt-to-media tool. Do not call image, video or voice
  providers yourself.
- Show the script, the shot plan and the credit estimate before creating media
  or spending anything. Saving a Script is not approval.
- Submit only with a `maxCredits` the creator approved and a stable
  `idempotencyKey`. After a timeout or unknown outcome, look up the original
  request with `film_v1_request` instead of submitting again.
- Ask before installing anything (Python packages, the voice and speech models)
  and say how big it is. Never ask for or paste passwords, tokens or keys.
- Facts must be true and suit a general audience. Check each one; if you are
  not sure of a number, leave it out.
- Nothing is posted anywhere. Preparing a release in Vixel is not publishing.
  Keep the "made with Vixel" end tag the kit draws.

## 1. Pitch, script and estimate

Ask which animal, or pitch 3 animals that each have one surprising true fact.
Then write:

- **The script**: 30-35 s at about 3.2 words per second (95-110 words), one
  fact per sentence. Line 1 is a hook question about the weirdest fact. The
  last line flips the hook into a punchline.
- **The shot plan**: one row per line with its place, the pose, the title word,
  the drawn prop and the sound. The place or framing changes every 2-3 s; the
  most shocking fact gets the biggest title and the sad trombone.
- **The credit estimate**: count the pictures (character looks, one background
  per place, one pose per beat that needs a new pose; neutral beats reuse a
  look's front or side view). The quotes are the price. At the time of writing
  a high-quality image is 30 credits, so a first episode of about 16 pictures is
  about 480 credits; a later episode that reuses the cast and sets costs less.
  Read the balance with `film_v1_account`.

Wait for the creator's approval of all three.

## 2. The Vixel Work

1. `film_v1_project_create` with `aspectRatio` `9:16`, a title and a premise.
2. `film_v1_screenplay_create`: a short **Creative direction** block
   (audience, one-line story, art style, length, number of beats, cast,
   places, and "no words or numbers inside the pictures"), then scenes whose
   lines are spoken by `NARRATOR (V.O.)`. Show it, wait for approval and keep
   the `screenplayHash` from `film_v1_screenplay_get` as
   `approvedScreenplayHash`. A changed Script needs fresh approval.
3. `film_v1_story_save`: the scenes, the last one an `ending`. Each scene's
   `durationMs` must equal the sum of its beats' `durationMs` (beats are 3-15 s
   in 0.5 s steps), or production fails with a scene duration mismatch.
4. `film_v1_production_plan`: one beat per narration line with `delivery`
   `voice_over` and `voicedBy` `narration` (the narrator is heard over the
   pictures, never inside a video), and these Elements:
   - Each on-screen character: a description that starts with one sentence
     that tells them apart, then the details, in the same style words every
     time ("flat 2D cartoon, thick dark brown outlines, flat colours with
     simple cel shading, big expressive eyes, clean vector look").
   - One location per background, described as an empty scene in the same
     style words, with "no characters, no text".
   - The narrator. If your Vixel tools include `film_v1_element_voice`, the
     narrator is a `voice` Element with a `voice` (step 3 uses it). Otherwise
     make the narrator a `character` Element that is never on screen, with a
     `voice`, so the voice-over lines map to a speaker.
5. Quote every picture first and show the total, then submit each approved
   quote and follow its Job with `film_v1_job`. Make the character looks first
   and check them; the pose frames copy their identity.
   - **Character looks** (Element image): ask for a plain pure white
     background with every view fully separate and generous white space
     between them, so each view can be cut out.
   - **Backgrounds** (location look, Element image), with this direction:
     "One single tall vertical 9:16 portrait illustration filling the whole
     frame, not a sheet or grid. Same flat 2D cartoon style. Empty scene, no
     characters, no animals, no text. Keep the middle and lower middle open."
   - **Poses** (a Shot's opening image: target `shot`, `mediaKind` `image`),
     as a cutout plate on pure white: "Character cutout plate for a cartoon
     edit, not a scene. <who> alone on a flat plain pure white background: no
     water, no scenery, no ground, no shadow. Full body, centred, about 70% of
     the frame height, nothing touching the frame edges. <the pose and
     expression>. Same flat 2D cartoon style as their character sheet."
6. Download each accepted picture into `src/` with curl and retries
   (`curl -L --retry 4 --retry-all-errors -o FILE URL`; with Python, set a
   User-Agent header). Looks and backgrounds use the Job asset's `publicUrl`.
   A pose uses the uncropped original,
   `asset.metadata.mediaContract.originalOutput.publicUrl`; the asset's own
   file is fitted to 9:16 and may crop the character. Compare each file's
   sha256 with the one the Job reports. Name them `src/look_<who>.png`,
   `src/bg_<place>.png` and `src/pose_<beat>.png`.

## 3. Narration

- **Vixel narration**, when your tools include `film_v1_element_voice`: bind
  the narrator's voice with it, then quote each Shot that carries a
  `voice_over` line with `mediaKind` `audio` and show the credits. Submit every
  approved line before placing any, because placing one changes the Work.
  Place each reviewed line with `film_v1_timeline_patch` using its Job's
  `placeAs`, read `film_v1_export_manifest`, download each line from its
  `url` into `audio/lines/` in script order, and join them:
  `PY KIT/scripts/tts.py --clips audio/lines/* --out audio/vo.wav`.
- **Local voice** otherwise: Kokoro runs on this computer for free. With the
  creator's OK, set up the kit's Python environment and the voice model
  (`KIT/README.md`), then
  `PY KIT/scripts/tts.py --lines script.txt --out audio/vo.wav`
  (voice `af_heart`, speed 1.1). Aim for 29-33 s; a longer take needs a
  shorter script, which the creator approves again.

Tell the creator which voice you used.

## 4. Word timing

`PY KIT/scripts/words.py audio/vo.wav --out audio/words.json --script script.txt`
runs faster-whisper on this computer and prints every word as `wN` with its
start time. It stops with exit code 1 when the transcript differs from the
script; listen, then retake the line or fix the script. Every cut, pose change,
title and sound in the shot plan starts on a word: `w12`, or `w12+0.3`.

## 5. Cutouts, plates and anchors

Look at each character sheet, then name its views left to right, row by row
when the sheet is a grid (`_` skips a view):

```
PY KIT/scripts/prep.py look src/look_dad.png --out cut --views _,dad_front,dad_side,_
PY KIT/scripts/prep.py cutout src/pose_*.png --out cut
PY KIT/scripts/prep.py plate src/bg_*.png --out cut
PY KIT/scripts/prep.py anchors cut --region belly=236-255,206-239,161-214
```

A picture that came back on a flat colour is keyed out automatically. Anchors
are points that rings, arrows, bursts and thrown props aim at: `left_tip`,
`right_tip`, `top`, `bottom`, `center`, and any colour region you name with
`--region` (sample the colour from the cutout first).

## 6. Shot plan and contact sheet

Write `plan.json` from the shot plan the creator approved, following
`KIT/README.md` and `KIT/examples/seahorse/plan.json`. Then:

```
PY KIT/scripts/render.py plan.json --check
PY KIT/scripts/render.py plan.json --sheet out/sheet.jpg
```

Look at the contact sheet (`KIT/examples/seahorse/contact-sheet.jpg` shows the
finished example) and fix anything covered, off-frame, unreadable or not
moving: a starburst over a face, a title behind a character, a pose that
does not match its line. Show the sheet to the creator before the full render.

## 7. Render and mix

```
PY KIT/scripts/render.py plan.json --out out/video.mp4
PY KIT/scripts/sound.py out/video.sound.json --voice audio/vo.wav --video out/video.mp4 --out out/final.mp4
```

`sound.py` synthesises the music bed and one sound per cue, ducks the bed
under the voice, normalises to -14 LUFS with a true peak of at most -1.5 dBTP,
and writes `out/final.qa.json`. Check that its `ok` is true, then make a
contact sheet of the finished file
(`ffmpeg -i out/final.mp4 -vf "fps=1/2,scale=216:-1,tile=8x2" -frames:v 1 out/final_sheet.jpg`)
and look at it.

## 8. Report

Give the creator the final MP4, the contact sheet, the Work link
(`film_v1_handoff`), the credits the Jobs actually charged, the voice used and
anything you could not verify. Save the final film to the Work as a prepared
release (`film_v1_release_upload_intent`, `film_v1_release_upload_finalize`,
`film_v1_release_create`) only when the creator asks. The creator posts it.

For the next episode of the same family, keep the `cut/` folder: the front and
side views and the plates can be reused, so only new poses and new places cost
credits.

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
