---
name: vixel-trend-remake
description: Put the creator's pet, their own or an original character, or the creator themselves into a trending reel with Vixel, from one reel link and one picture. Vixel downloads the reel, picks the part to recreate and makes the remake on its servers after the creator confirms the credits. Use when the creator shares an Instagram or TikTok reel, a dance trend or a meme video and wants their dog, cat, cartoon character, mascot or themselves doing it.
---

# Trend remakes with Vixel

The creator gives you two things: a link to a trending reel and one picture of
who should be in it. Vixel does the rest on its servers: it downloads the reel,
chooses the part to recreate, makes the look and the video, and returns the
finished remake. You do not create a Work, write a Script, cut the video or
write prompts. Your job is to pick a reel that works, get the creator's yes,
follow the remake and help them post it well.

## Who can be in a remake

- **An animal** (`subjectKind: animal`, with `petKind` `dog`, `cat` or `pet`):
  the creator's pet or another animal.
- **A character** (`subjectKind: character`): the creator's own or an original
  cartoon, anime, 3D, mascot, toy or illustrated character. Characters someone
  else owns (Disney, Pokémon, Marvel and the like) are refused.
- **The creator themselves** (`subjectKind: self`): only the creator, only
  adults. Before quoting, ask the creator to confirm the photo is of them and
  that they are 18 or older, and pass `subjectIsSelf: true` only after their
  yes. Use a personal photo or selfie of them alone, not a screenshot, a press,
  stage or event photo, a poster or a magazine picture. The result is labeled
  as AI-generated.

**Two subjects** — two pets, a pet and a character, or the creator and their
pet — go in `subjects`: one entry each with its own picture, `name`, `kind`
(and `petKind` or `isSelf`), and optionally `position` `left` or `right`. Pick a
reel with exactly two dancers, one for each subject; Vixel cannot count the
dancers. Each subject gets its own look and price, and three or more are
refused.

**Not allowed:** any other real person, including friends, family, celebrities
and public figures; anyone under 18; characters someone else owns. Vixel
refuses these, and you must not try to get around it (for example by calling a
celebrity photo "self" or a real person a "character").

## Fixed rules

- Only clips the creator may use: their own video, one they licensed, or one
  whose creator allowed it. Ask before every remake and pass
  `clipRightsConfirmed: true` only after their yes. When in doubt, pick
  another reel.
- Quotes are free. Spend credits only with a `maxCredits` the creator approved,
  and a stable `idempotencyKey`. After a timeout, call the same tool again with
  the same key; never invent a new key for the same remake.
- Nothing is posted anywhere until the creator approves the exact post.

## 1. Choose a reel that works

Remakes come out best from a reel with:

- one dancer per subject (one, or two for two subjects), full body in frame the
  whole time;
- a locked camera (on a tripod or propped up), not handheld;
- one continuous shot, with no cuts, zooms or split screens;
- a plain, well-lit room; no text, stickers or other people walking through.

The remake keeps the reel's own room, light and camera, with your subjects in
the dancers' places. Changing the setting is not supported: asked for another
place, the video falls back to the original footage.

Vixel recreates at most 15 seconds. A reel up to 15 s is used whole; for a
longer one Vixel picks the 12 s with the most movement, and you can pass
`window` (`startSeconds`, `endSeconds`) to choose the part with the hook.
Vixel cannot see whether that part is one continuous shot of one dancer, so
check it yourself.

For the picture: one clear picture of the subject on its own, face visible,
ideally the whole body, in good light. Several subjects in one picture confuse
the result.

## With a computer: prepare the clip, then check the take

If you can run commands (Claude Code, Codex, an agent with its own computer),
prepare the clip yourself and check the take afterwards: remakes come out
cleaner. Without a computer, skip this section and pass the reel link. You need
`ffmpeg` and `ffprobe`; ask before installing anything.

1. **Get the file.** Use the video file you already have, or download it, for
   example `yt-dlp -o reel.mp4 "<reel link>"`. When `film_v1_remake_quote` was
   given a page link, its `clip.videoUrl` is the file Vixel used; the link
   expires within hours, so fetch it right away to work on the same file.
2. **Find the cuts.** Make frame grids at 4 frames a second (32 frames, 8 s,
   per image) and look at every one:
   `ffmpeg -i reel.mp4 -vf "fps=4,scale=180:-1,tile=8x4" grid-%02d.jpg`
   List likely scene changes, then look at the frames around each:
   `ffmpeg -i reel.mp4 -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep -o "pts_time:[0-9.]*"`
   The scores miss jump cuts, so trust the grids. Pick a window of 5-15 s
   (8-12 s is best) inside one continuous shot, starting and ending on a calm
   moment, a whole number of seconds long.
3. **Clear burned-in text** (captions, stickers, usernames, watermarks). The
   video model redraws any text it sees, and blur boxes too. From sampled
   frames, list a tight box `X,Y,W,H` in source pixels for each piece of text
   and the seconds `A`-`B` it shows. Chain one block per box:
   - text that moves or changes: fill the box from the frames around it with a
     temporal median (`radius` is the frame rate):
     `[v]split[a][b];[b]crop=W:H:X:Y,tmedian=radius=30[m];[a][m]overlay=X:Y:enable='between(t,A,B)'[v2]`
   - text that never moves: soften the box instead:
     `[v]split[a][b];[b]crop=W:H:X:Y,scale=3:3:flags=area,scale=W:H:flags=bicubic[m];[a][m]overlay=X:Y[v2]`

   Never cover a full-width band: a gesture under a mask is lost. Look at the
   frames again afterwards.
4. **Cut and encode** the window frame-accurately as H.264. Times are in the
   source; `[v2]` is your last block's output (start the chain from `[0:v]`):
   `ffmpeg -i reel.mp4 -filter_complex "<blocks>" -map "[v2]" -map "0:a?" -ss START -to END -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart clip.mp4`
   With no text to clear, use `-map 0:v` and no `-filter_complex`.
5. **Upload it.** `film_v1_ensure_workspace`, then `film_v1_upload_intent` with
   `mimeType` `video/mp4`, the file's `byteSize`, `sha256` and `durationMs`
   (`ffprobe -v error -show_entries format=duration -of csv=p=0 clip.mp4`),
   PUT the bytes to the returned link with its headers, and
   `film_v1_upload_finalize`. Then quote with `clipAssetId` instead of
   `reelUrl`, and no `window`.
6. **Check the take** when `film_v1_remake` is done. Download
   `result.videoUrl` as `take.mp4` and compare the middle of every frame with
   your clip, ten times a second:
   `ffmpeg -i take.mp4 -i clip.mp4 -lavfi "[0:v]scale=270:480,fps=10,crop=150:300:60:110,format=gray[a];[1:v]scale=270:480,fps=10,crop=150:300:60:110,format=gray[b];[a][b]ssim=stats_file=ssim.log" -f null -`
   (for a landscape clip use `scale=480:270` and `crop=300:150:90:60`).
   Average the `All:` values per second. Clean remakes score about
   0.43-0.51; a take that copies the original clip scores 0.60-0.88. Flag any
   second at 0.60 or more, or any second 0.3 or more above the first. The
   numbers cannot catch everything (a subject's head on the dancer's body
   scored 0.52-0.58), so always look at frames every 0.5 s through the first
   3 s and at every arms-up moment:
   `ffmpeg -t 3 -i take.mp4 -vf "fps=2,scale=270:-1,tile=6x1" -frames:v 1 first-3s.jpg`
   If the original dancer, a human body part where there should be none, or
   the original's text shows, offer `film_v1_remake_redo`; it costs credits,
   so ask the creator first.
7. **Longer reels.** One remake covers one shot of up to 15 s. For a longer
   reel, or one with several shots, prepare the best single shot.

## 2. Quote, confirm, make

1. `film_v1_remake_quote` with `reelUrl` (or `clipAssetId`), `photoUrl` (or
   `photoAssetId`), `subjectName`, `subjectKind` (and `petKind` for an
   animal, `subjectIsSelf` for the creator) and, if wanted, `window` and
   `audio`. `photoUrl` can be the image's own link or, where Vixel can open
   Instagram links, an Instagram post. `audio` `take` keeps the sound the
   video model made; `reel` lays the reel's own sound under the remake.
2. Show the creator the window Vixel chose (and why), the credits and what it
   makes, and ask whether they may use this clip.
3. On their yes: `film_v1_remake_generate` with the same inputs, the
   `quoteId`, `maxCredits` (at least `estimatedCredits`),
   `clipRightsConfirmed: true` and a new `idempotencyKey`.
4. Read `film_v1_remake` with the `projectId` about every 30 seconds until the
   stage is `done`, `needs_credits` or `failed`. A remake usually takes 2-4
   minutes. Follow its `nextStep`.

If Vixel says it cannot open a page link, ask the creator for the video file
itself: with a terminal you can download it (for example with `yt-dlp`) and
upload it with `film_v1_upload_intent` and `film_v1_upload_finalize` into the
My Assets workspace (`film_v1_ensure_workspace`), then pass its `assetId` as
`clipAssetId`. A picture can be uploaded the same way as `photoAssetId`.
If Vixel says the video is HEVC, convert it to H.264 first
(`ffmpeg -i in.mp4 -c:v libx264 -crf 20 -c:a aac out.mp4`) and upload that.

## 3. Review before anyone sees it

Watch the whole result with the creator, and look hardest at:

- the first three seconds: no trace of the original dancer, not even in the
  very first frame;
- every arms-up or arms-crossed moment: the subject's own paws, hands or
  limbs, never the original dancer's;
- mirrors and reflections, which should show the subject too;
- for a character, that it keeps its own look; for the creator, that it still
  looks like them.

If anything is off, offer `film_v1_remake_redo` for the
`redo.estimatedCredits` that `film_v1_remake` reports.

## 4. Post it the right way

- Use the trend's own sound: the creator posts from the Instagram or TikTok app,
  silences or removes the file's sound and picks the original sound of the
  trend. Trending songs are cleared for use inside the apps, not in a file you
  upload.
- Credit the original dancer in the caption (for example "original: @name")
  and tag the trend.
- Say it was made with AI where the platform asks (TikTok's AI-generated
  content setting, Instagram's AI label). A remake of the creator must always
  be labeled as AI-generated: when posting through Vixel, TikTok needs
  `videoMadeWithAi` true, and Instagram and YouTube captions must say
  "AI-generated" (Vixel refuses the post otherwise).
- Posting through Vixel uploads the file as it is, with the sound inside it:
  `film_v1_release_create` with the result's `assetId`, then
  `film_v1_post_prepare`, show the creator the exact preview, and
  `film_v1_post_publish` only after their yes.

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
- Cursor, ChatGPT, Meta Muse and other clients: add the MCP server URL
  `https://drama.vixelai.com/api/mcp` as a connector and sign in, or follow
  <https://drama.vixelai.com/creator/mcp>.

The creator approves access in the browser.
