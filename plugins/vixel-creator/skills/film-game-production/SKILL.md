---
name: film-game-production
description: Operate Vixel Film media through the Film v1 MCP contract. Use when the user asks to make a film, images or videos in a Vixel Work, inspect Vixel credits and Jobs, upload references, or review results in their Vixel studio. Use the website for adoption, Timeline editing, export and publishing.
---

# Vixel Film media

The skill path is retained for existing installations; this version uses Film
v1 tools, not the retired Canvas film-game contract. Reconnect with `film.read`,
`film.write`, `film.generate` and optional `offline_access`. Mixed Film/Creator
grants select the Film registry; use a separate legacy connection if needed.

## Choose and author the same Work

Use `film_v1_projects` to list owned Works and `film_v1_project` with an
explicit `projectId` to read the current revision, documents, scenes, Elements,
Shots, assets and Timeline. Resume an existing Work when requested. For a new
film, `film_v1_project_create` accepts title, premise, aspectRatio and a stable
`idempotencyKey`; it creates an empty Work within the website's account allowance
and returns its canonical state and webUrl. It performs no text/media generation.

After saving the Script, `film_v1_story_save` writes the complete scenes array;
`film_v1_plan_save` writes complete elements and shots arrays. Both require
`projectId`, `expectedRevisionId`, `expectedWriteVersion` and `idempotencyKey`.
Read before editing; preserve every unrelated scene/Element/Shot. Tool input
schemas describe writable fields; do not send the full read model as input.
The initial plan requires a saved canonical Script. Story/Plan writes are direct
creator-authorized edits, not approval of media, a new production run, or proof
of an approved Director proposal. Read back returned receipts and current state.
On unknown outcomes replay the exact input/key; stale versions require a fresh
read and an intentional revised edit, not automatic overwrite.

## Project workflow and visible workspace

For a complete film request, preserve the platform order: **Script (screenplay)
→ Story/Production Plan with Elements and Shots → first looks → storyboard
review → video → preview/export**. A standalone media request does not require
a screenplay. For an existing project, inspect the current checkpoint and
continue within the user's scope rather than rebuilding earlier work.

The Script page requires a saved document with `documentKey: "screenplay"`
and `kind: "script"` on the current Work revision. Scene `script` strings,
a story graph or confirmed Story readiness are not substitutes. Do not create
initial Elements/Shots before the screenplay is saved and its stage approval
requirements are satisfied. Use `film_v1_screenplay_get` with `projectId` to
read the document and current revision. When absent, `film_v1_screenplay_create`
saves `title`, `content` and optional `format` (`markdown` by default); supply
`projectId`, `expectedRevisionId`, `expectedWriteVersion` and a stable
`idempotencyKey`. To revise an existing screenplay, use
`film_v1_screenplay_update` with those fields plus its exact `documentId`.
Read back the result. Saving does not approve it or start Story/Plan/media.
After an uncertain write, retain and replay the exact original input/key;
do not create a new key or infer success from a similar-looking document.
If these tools are absent on the connected server, use a supported website/CLI
operation or report the missing capability. Do not skip ahead or call Vixel's
internal conversational Agent. Template-inspired manual authoring is not proof
of native template execution.

Generate new media, including starter references, through Vixel CLI/MCP. Do not
substitute built-in imagegen or direct provider generation followed by upload.
User-supplied/existing references may be uploaded; explicitly requested external
generation must remain identified as external. Disclose reuse of existing media.
Platform unavailability is a blocker, not authorization to switch providers.

When Codex panel tools are available, proactively open the resolved Vixel origin
with `mcp__codex_app__open_in_codex`, `placement: "right"`, and a browser target.
Once the exact Work URL is returned, show that project in the same task's panel
while working; do not wait for the user to request it or for final delivery.
Keep the browser and MCP on the same environment. `queued` means only queued,
not loaded, signed in or visually verified. Respect browser-operation denials;
do not switch automation tools to bypass them. Continue permitted backend work
and disclose the visual-verification gap.

## Produce media inside the Work

Every image and video is produced inside a Work through Vixel production; there
is no raw prompt-to-media tool. Do not call Vixel's internal conversational Agent.

1. Call `film_v1_account` and `film_v1_models` to establish identity and the
   configured models. Inspection creates nothing.
2. After the creator approves the Script, keep the `screenplayHash` returned by
   `film_v1_screenplay_get` as `approvedScreenplayHash`. Save the cast and
   creative beats with `film_v1_production_plan` on the current
   `expectedRevisionId` and `expectedWriteVersion`. Vixel prepares prompts and
   references on the server; do not write provider prompts.
3. Call `film_v1_production_quote` for one exact Element or Shot target, with a
   `direction` describing the desired result. Show `estimatedCredits`. A quote
   creates no Job or debit. A model appearing in the catalog is not proof it
   executed successfully.
4. Obtain the user's explicit approval for spending unless this exact action and
   budget are already authorized. Call `film_v1_production_generate` with the
   same inputs, returned `quoteId`, an explicit `maxCredits`, and a stable
   `idempotencyKey`. OAuth connection consent alone is not user authorization to
   spend. If Vixel requests image preparation, use
   `film_v1_production_frame_prepare`, review the candidate, accept it with
   `film_v1_asset_review` as the Shot's `storyboard` (the result's `adoptAs`),
   leave the keyframe empty, then read the Work and quote again.
5. Track `film_v1_job` using returned `projectId` and `jobId` (`job.id` in the
   response). On an unknown submission outcome use `film_v1_request` with the
   original key. Never generate a replacement to resolve a timeout.
   `film_v1_sync` reconciles the same Job; `film_v1_resume` is explicit recovery
   after top-up and may spend credits. Preserve the original Job and receipt.
6. Read `film_v1_project` and `film_v1_handoff`. Open the returned Vixel URL in
   the available browser, inspect the asset and report its actual
   candidate/accepted state. Tool success does not prove visual quality or acceptance.

For local references, use `film_v1_upload_intent` with the Work guard, byte
size, MIME and SHA-256. Upload bytes to the signed URL without OAuth/cookie
headers, then call `film_v1_upload_finalize` with the same input/key and
returned storage key. Alternatively use the CLI `assets upload`. Only finalized
owned asset IDs can be used as references. The service does not import
arbitrary URLs. Existing website results live in My Assets: `film_v1_assets`
lists them, `film_v1_workspace` and `film_v1_ensure_workspace` inspect or create
that private library, and `film_v1_add_to_work` copies a selected result into an
explicit Work for review; it does not adopt the asset.
Before dependent Work generation, verify that the references are ready and the
relevant Elements/Shots have current accepted bindings. A copied `candidate`
does not satisfy that requirement. Use `film_v1_asset_review` for an explicitly authorized adoption; never silently promote status or treat an asset copy as a
completed first look. Report the last completed checkpoint if blocked.

Audio generation, hosted rendering, public publication and social distribution are outside this MCP version. Never publish through these preparation tools or route around missing capabilities using legacy/admin tools. Keep product text in English; do not expose credentials
or private provider configuration. No extra connection discount is assumed.

## Accepted cut and prepared release

Use `film_v1_asset_review` for explicitly authorized accept/reject decisions and `film_v1_shot_references` for exact Shot bindings. Preserve the canonical revision and stable request key. Use `film_v1_timeline_patch` / `film_v1_timeline_undo` for typed edits and receipt-bound recovery. A saved storyboard is not automatically a Timeline still; preserve all visible siblings when materializing clips.

`film_v1_export_manifest` reads the same accepted first-route cut as web Preview. CLI `exports render` can render it with local FFmpeg; MCP itself does not execute a server render Job. Inspect skipped/unready slots and stills before calling the film complete. Respect watermark entitlement.

For titles, captions and motion graphics, finish with Remotion in the working
folder. If it has no `vixel-remotion` project, tell the user once that Remotion
is free for individuals and companies with up to 3 employees and larger
companies need a Remotion Company License, then run
`npx --yes create-video@4.0.539 --yes --blank vixel-remotion` and
`npx --yes skills@1.7.0 add remotion-dev/skills --yes`. Download each manifest
asset from its `url` with curl or Node `fetch` (the media host rejects Python's
default urllib User-Agent; set one if you use Python) and compare its `sha256`;
keep the Vixel watermark unless
`cleanExportEntitled`. A Remotion render is a local file and publishes nothing.

After review, `film_v1_release_upload_intent` and `film_v1_release_upload_finalize` upload and verify the final MP4; send storage bytes without account credentials. `film_v1_release_create` creates a prepared release; `film_v1_releases` reads it back. None of these tools posts to a social account or supplies audience observations.
