# Vixel for Claude Code

Version `1.0.0-alpha.6` connects Claude Code to your Vixel account with browser
sign-in. It adds the Vixel MCP server and two Skills:

- `vixel-film` follows Vixel's current method: draft and approve a Script, plan
  characters and shots, quote and produce each image or video inside a Work,
  review the cut and finish titles with Remotion.
- `vixel-animal-facts` makes 30-second cartoon animal-facts shorts: Vixel makes
  the characters, backgrounds and pose cutouts, and the Skill's kit animates
  them with captions, titles, music and sound effects on your computer.

```text
/plugin marketplace add Vixel-AI/vixel-plugins
/plugin install vixel@vixel
```

Then run `/mcp`, select `vixel`, choose Authenticate and approve access in the
browser. To add only the Skills to Claude Code or another agent, run
`npx skills@1.7.0 add Vixel-AI/vixel-plugins`; they explain how to connect Vixel. Quotes are free; nothing is generated or charged without your approval
and credit limit, and nothing is posted to social channels. Manage access at
<https://drama.vixelai.com/creator/mcp>.
