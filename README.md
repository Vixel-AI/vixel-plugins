# Vixel plugins

Make films with your AI agent in your Vixel account. Each plugin connects your
agent to Vixel through MCP with browser sign-in and adds Vixel's filmmaking
method: draft and approve a Script, plan characters and shots, quote and
produce each image or video inside a Work, review the cut and finish titles
with Remotion.

Quotes are free. Nothing is generated or charged without your approval and
credit limit, and nothing is posted to social channels.

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

## Other agents

Any client that supports remote MCP servers with OAuth can connect to
`https://drama.vixelai.com/api/mcp`. The connection page at
<https://drama.vixelai.com/creator/mcp> has steps for Claude Code, Codex,
Cursor and the Claude app, and lets you manage or revoke access.

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
