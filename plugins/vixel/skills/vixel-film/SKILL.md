---
name: vixel-film
description: Make or revise a short film, character, storyboard image or video with Vixel. Use when the user wants to create films, images or video in Vixel, continue one of their Vixel Works, or finish a Vixel cut with titles or captions.
---

# Make films with Vixel

The `vixel` MCP server carries Vixel's current filmmaking method. Before acting,
read the `vixel://skills/vixel-film` resource (the same text as the
`make_short_film` prompt) and follow it. If the `vixel` tools are missing,
connect first (below).

- Every image and video is produced inside a Work. Choose an existing Work or
  create one, save the Script and get the creator's approval, save the Story
  and production plan, then use production quote and production generate for
  each Element or Shot. There is no direct prompt-to-media tool.
- Show every quote and wait for the creator's approval before spending credits.
  Keep the original request key; after a timeout, look up the original Job.
- For titles, captions and motion graphics, follow the server's Remotion steps
  in this project folder and tell the creator Remotion's license terms first.
  This Skill's `kit/` folder holds Vixel's finishing kit: download and check the
  cut, review clips, check lines, build the edit, add music and render. Its
  `kit/README.md` lists the prerequisites (Node.js 22+, FFmpeg, git, optional
  transcription) and the commands.
- Preparing a release is not publishing. Report the Work link and anything you
  could not verify.

## Connect Vixel first

These steps need the `vixel` MCP tools. If they are missing, ask the creator
before changing their agent's configuration, then connect with browser sign-in
(no API key):

- Claude Code: `claude mcp add --transport http vixel https://drama.vixelai.com/api/mcp`,
  then `/mcp`, select `vixel` and choose Authenticate. With the Vixel plugin
  installed, only the `/mcp` step is needed.
- Codex: `codex mcp add vixel --url https://drama.vixelai.com/api/mcp`, then
  `codex mcp login vixel --scopes film.read,film.write,film.generate,offline_access`,
  and start a new task.
- Cursor and other clients: add the MCP server URL
  `https://drama.vixelai.com/api/mcp` and connect, or follow
  <https://drama.vixelai.com/creator/mcp>.

The creator approves access in the browser. Never ask for or paste passwords,
tokens or authorization codes.
