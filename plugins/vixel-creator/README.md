# Vixel Film for Codex

Version `1.0.0-alpha.5` connects Codex to your Vixel account through
MCP contract `film-v1` with browser OAuth. Make a film inside a Vixel Work:

1. Draft the Script, save it and approve it.
2. Plan characters, scenes and shots.
3. Quote each image or video, approve the cost, and let Vixel produce it from
   the approved Script.
4. Review results, edit the Timeline, export the accepted cut and finish titles
   or captions with Remotion.

Every image and video is made inside a Work; there is no direct prompt-to-media
tool. Quotes are free. Nothing is generated or charged without a quote and your
credit limit, and nothing is published to social channels.

## Install

```sh
codex plugin marketplace add https://github.com/Vixel-AI/vixel-plugins
codex plugin add vixel-creator@vixel-ai
```

Start a new Codex task, then sign in to Vixel in the browser when Codex asks.
The connection requests `film.read film.write film.generate offline_access`.
Manage or revoke access from <https://drama.vixelai.com/creator/mcp>.

## Notes

The canonical source lives in the Vixel product repository; this bundle is
exported from it. The skill is guidance, never an authorization boundary: the
server owns scopes, owner isolation, revision checks, quotes, credit limits,
idempotency and receipts. No token, provider key or user data belongs here.
Production migrations/deployment and sign-in on your target platform are
checked separately from this bundle. Audio generation, public posting and
audience metrics are not available.
