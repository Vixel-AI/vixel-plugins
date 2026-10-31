# Vixel finishing kit

Local tools for finishing an accepted Vixel cut with Remotion: download and
verify the cut, review each clip, check the spoken lines, build the edit, add an
optional music bed, mix, normalize loudness and render. Node.js 22+ and FFmpeg
are required; Remotion runs from your `vixel-remotion` project. No dependency is
installed by these scripts and none of them changes a Work, spends credits or
posts anything.

`KIT` below is this folder (`<vixel-film Skill folder>/kit`).

| Step | Command |
| --- | --- |
| Add the template to the Remotion project (once) | `node KIT/scripts/install-template.mjs vixel-remotion` |
| Save the export manifest JSON, then download and verify the cut | `node KIT/scripts/fetch-cut.mjs --manifest manifest.json --project vixel-remotion` |
| Picture check: decode errors, lengths, contact sheets | `node KIT/scripts/review-clips.mjs --project vixel-remotion --beats plan.json` |
| Word timestamps (needs faster-whisper; otherwise listen) | `node KIT/scripts/transcribe.mjs --project vixel-remotion --beats plan.json` |
| Compare planned lines with what was said | `node KIT/scripts/check-lines.mjs --project vixel-remotion --beats plan.json` |
| Build `public/cut/edit.json` | `node KIT/scripts/make-edit.mjs --project vixel-remotion --beats plan.json` |
| Layout stills | `node KIT/scripts/render.mjs --project vixel-remotion --stills` |
| Render, mix and check | `node KIT/scripts/render.mjs --project vixel-remotion` |

- `manifest.json` is the JSON returned by `film_v1_export_manifest` (or
  `vixel exports manifest --json`). `fetch-cut` stops on open `issues` unless the
  creator accepted them (`--accept-issues`), and on any sha256 or size mismatch.
- `plan.json` is the production plan body you saved (`beats[]` with `shotKey`
  and `dialogue`). Add `--work work.json` (the `film_v1_project` result) when the
  number of visuals differs from the number of beats.
- `check-lines` is advisory. It suggests a trim (`sourceStartMs`/`durationMs`),
  a local mute, or a retake with a repair category. Mute only in the local edit
  (`--mute 2` or an override); a Timeline mute blocks the export manifest.
- `review-clips` also measures the rhythm of each clip's main motion
  (`motion` in `review/clips.json`): `clear`, `bpm`, `strength` and `hitsMs`,
  the moments of each cycle's extreme (the bottom of a nod, a landing) counted
  from the clip's used start.
- `make-edit` options: `--title`, `--no-title`, `--end-line` (repeatable),
  `--subtitles auto|script|captions|none`, `--music auto|none|<track you hold
  rights to>`, `--mood play|tiptoe|lullaby|upbeat|tense|sad`, `--bpm 60-180`
  (generated bed, default 100), `--mute`, `--no-brand-card` and
  `--overrides edit-overrides.json` (colours, title rows and accent words,
  per-visual `volume`, `fadeIn`, `fadeOut`, `mood`, `fit`).
- Beat-cut: run `make-edit` with `--bpm` set to a clip's clear `motion.bpm`
  (or its double or half), then edit `segments[]` in `public/cut/edit.json`.
  One beat is `fps * 60 / bpm` frames. Give each segment a whole number of
  beats, start it on a hit (`trimBefore` frames = hit ms * fps / 1000), repeat a
  clip as often as the cut needs, keep `from` contiguous, update `totals`, and
  set `volume: 0` where clip sound would only chop.
- `FilmVixel` keeps the visible Vixel watermark. `Film` (clean) renders only
  when the manifest says `cleanExportEntitled`.
- Every render is a local file. Before preparing it as a release (only when the
  creator asks), read the export manifest again and compare `manifestHash`.

Preview while editing: `npx remotion studio src/vixel-film/index.ts` inside
`vixel-remotion`.

## Licenses

- Sora and Fraunces: SIL Open Font License 1.1, see
  `edit-template/public/vixel-film/fonts/*-OFL.txt`.
- `edit-template/public/vixel-film/brand/*`: Vixel brand marks, for crediting
  Vixel in films made with Vixel.
- The music bed is synthesized by `scripts/music.mjs`; it uses no samples.
- Remotion is licensed separately (remotion.pro/license). faster-whisper and its
  model weights are optional and installed by you.
