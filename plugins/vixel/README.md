# Vixel for Claude Code

Version `1.0.0-alpha.2` connects Claude Code to your Vixel account with browser
sign-in. It adds the Vixel MCP server and a `vixel-film` Skill that follows
Vixel's current method: draft and approve a Script, plan characters and shots,
quote and produce each image or video inside a Work, review the cut and finish
titles with Remotion.

```text
/plugin marketplace add Vixel-AI/vixel-plugins
/plugin install vixel@vixel
```

Then run `/mcp`, select `vixel`, choose Authenticate and approve access in the
browser. To add only the Skill to Claude Code or another agent, run
`npx skills add Vixel-AI/vixel-plugins`; it explains how to connect Vixel. Quotes are free; nothing is generated or charged without your approval
and credit limit, and nothing is posted to social channels. Manage access at
<https://drama.vixelai.com/creator/mcp>.
