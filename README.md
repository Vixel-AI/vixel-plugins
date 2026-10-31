<p align="center">
  <a href="https://www.vixelai.com/case-studies">
    <img src="https://raw.githubusercontent.com/Vixel-AI/.github/main/profile/assets/agent-films.gif" width="640" alt="Scenes from four Vixel short films directed from an AI agent: Where's Mimi?, Mika: The Moon Mission, Too Cute to Scare and Where Do the Socks Go?">
  </a>
</p>

# Vixel plugins: make AI short films with your agent

[![Claude Code plugin](https://img.shields.io/badge/Claude_Code-plugin-D97757?style=flat-square)](#claude-code)
[![Codex plugin](https://img.shields.io/badge/Codex-plugin-0F0F0F?style=flat-square)](#codex)
[![Remote MCP server](https://img.shields.io/badge/MCP-remote_server-5A67D8?style=flat-square)](#other-agents)
[![vixel-film Agent Skill](https://img.shields.io/badge/Agent_Skill-vixel--film-1D2456?style=flat-square)](#any-agent-the-skill-only)

Make films with your AI agent in your Vixel account. Each plugin connects your
agent to Vixel through MCP with browser sign-in and adds Vixel's filmmaking
method: draft and approve a Script, plan characters and shots, quote and
produce each image or video inside a Work, review the cut and finish titles
with Remotion.

Quotes are free. Nothing is generated or charged without your approval and
credit limit, and nothing is posted to social channels.

## Quickstart in 60 seconds

1. Paste this line into Claude Code, Codex, Cursor or another agent that can
   run commands:

   ```text
   Fetch and execute the appropriate instructions to set me up for Vixel from https://drama.vixelai.com/agent-setup.md
   ```

2. Your agent installs the plugin or connects the MCP server for its own
   client. When it opens the Vixel page, sign in and approve access in your
   browser. Never paste a password or token into the chat.
3. Your agent checks the connection by reading your account and credit
   balance. Then ask for a film, for example one of the prompts below.

Setup is free. It does not create a Work, generate media or spend credits.
Finishing a cut on your computer also needs Node.js 22 or later, FFmpeg and
git; the setup steps check for them and ask before installing anything.

To install by hand, use the section for your agent below.

## Claude Code

```text
/plugin marketplace add Vixel-AI/vixel-plugins
/plugin install vixel@vixel
```

Then run `/mcp`, select `vixel`, choose Authenticate and approve access in the
browser.

## Codex

```sh
codex plugin marketplace add https://github.com/Vixel-AI/vixel-plugins
codex plugin add vixel-creator@vixel-ai
```

Start a new Codex task and approve access in the browser when asked.

## Any agent: the Skill only

```sh
npx skills@1.7.0 add Vixel-AI/vixel-plugins
```

This installs the `vixel-film` Skill for Claude Code, Codex, Cursor and other
agents the [skills](https://www.npmjs.com/package/skills) installer supports.
The Skill explains how to connect Vixel when the tools are not set up yet.

## Other agents

Any client that supports remote MCP servers with OAuth can connect to
`https://drama.vixelai.com/api/mcp`. The connection page at
<https://drama.vixelai.com/creator/mcp> has steps for Claude Code, Codex,
Cursor and the Claude app, and lets you manage or revoke access.

## Example prompts

```text
Make a 60-second picture-book film about a kitten whose tail gives away her
hiding spot. Show me the script first.
```

```text
Here is my kid's drawing of a dinosaur. Make a 30-second animated short where
it waves back. Keep the character exactly as drawn.
```

```text
Plan a 9:16 Halloween short about a cat who is too cute to scare anyone.
Quote every shot before you produce it and keep the total under my limit.
```

```text
Open my latest Work, show me the shots that still need video, and redo shot 4
so the dad winks at the camera.
```

```text
Export the accepted cut and add a title card and subtitles with Remotion.
```

## Films made with agents

Each film was made by the Vixel team in one Vixel Work, directed from the Vixel
CLI. The CLI calls the same Film tools these plugins reach through MCP.

| | | |
| --- | --- | --- |
| [![Where's Mimi?](https://raw.githubusercontent.com/Vixel-AI/.github/main/profile/assets/films/wheres-mimi.jpg)](https://www.vixelai.com/case-studies/wheres-mimi) | [![Too Cute to Scare](https://raw.githubusercontent.com/Vixel-AI/.github/main/profile/assets/films/too-cute-to-scare.jpg)](https://www.vixelai.com/case-studies/too-cute-to-scare) | [![Mika: The Moon Mission](https://raw.githubusercontent.com/Vixel-AI/.github/main/profile/assets/films/mika-moon-mission.jpg)](https://www.vixelai.com/case-studies/mika-moon-mission) |
| **[Where's Mimi?](https://www.vixelai.com/case-studies/wheres-mimi)**<br>Storybook animation · 1:13 | **[Too Cute to Scare](https://www.vixelai.com/case-studies/too-cute-to-scare)**<br>Stop-motion style short · 1:16 · 9:16 | **[Mika: The Moon Mission](https://www.vixelai.com/case-studies/mika-moon-mission)**<br>Animated short for kids · 1:14 |
| [![Where Do the Socks Go?](https://raw.githubusercontent.com/Vixel-AI/.github/main/profile/assets/films/where-do-the-socks-go.jpg)](https://www.vixelai.com/case-studies/where-do-the-socks-go) | [![My Perfect Halloween: A Cat Vlog](https://raw.githubusercontent.com/Vixel-AI/.github/main/profile/assets/films/my-perfect-halloween-cat-vlog.jpg)](https://www.vixelai.com/case-studies/my-perfect-halloween-cat-vlog) | |
| **[Where Do the Socks Go?](https://www.vixelai.com/case-studies/where-do-the-socks-go)**<br>3D bedtime story · 1:08 | **[My Perfect Halloween](https://www.vixelai.com/case-studies/my-perfect-halloween-cat-vlog)**<br>Vertical cat vlog · 1:24 · 9:16 | [All films →](https://www.vixelai.com/case-studies) |

## FAQ

### What does it cost?

Connecting, setup, reading your Works and quotes are free. Images and video use
credits from your existing Vixel balance. Your agent shows the quote for each
image or video and submits it only with a credit limit you approve. If a
request times out, your agent looks up the original Job instead of submitting
it again, so a retry does not charge twice. See
[plans and credits](https://drama.vixelai.com/plans).

### What needs my approval?

- Access to your account, in your browser.
- The Script, before any production starts. Saving a Script is not approval.
- Every quote, before an image or video is generated.
- Remotion's license terms, before your agent sets up finishing.

Nothing is posted to social channels. Preparing a release in Vixel is not
publishing it.

### What can my agent see and change?

Only your Vixel account, Works and My Assets library, through the access you
approved.
The connection asks to read Works, change Works, and generate media, and to stay
signed in. Your agent never sees your password, and these plugins hold no API
keys. Scripts, references and media stay in your Works in your Vixel account.
Revoke access at any time at <https://drama.vixelai.com/creator/mcp>. See the
[Privacy Policy](https://www.vixelai.com/privacy-policy).

### Do I need an API key?

No. You sign in with your Vixel account. Finishing a cut locally needs Node.js
22 or later, FFmpeg and git; making images and video does not.

### Which agents work?

Claude Code and Codex have plugins. Cursor, the Claude app and other clients
that support remote MCP servers with OAuth can connect to the server directly,
and any agent the `skills` installer supports can add the Skill.

## Contents

- [`plugins/vixel`](./plugins/vixel) — Claude Code plugin.
- [`plugins/vixel-creator`](./plugins/vixel-creator) — Codex plugin.
- [`docs/MCP_TOOL_CONTRACT.md`](./docs/MCP_TOOL_CONTRACT.md) and
  [`contract/tool-surface.json`](./contract/tool-surface.json) — the tools and
  scopes these plugins connect to.

This repository is generated from the Vixel product repository; changes made
here are replaced by the next export. Requires a Vixel account at
<https://drama.vixelai.com>. See the [Terms](https://www.vixelai.com/tos) and
[Privacy Policy](https://www.vixelai.com/privacy-policy).
