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
