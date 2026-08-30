# NitterTS

A TypeScript port of [Nitter](https://github.com/zedeus/nitter) running on Cloudflare Pages.
Styles and front-end scripts are built straight from the upstream `nitter` submodule, and
behavior tracks the original: timelines, search, media proxying (`/pic`, `/video`), RSS
feeds, preferences, and instance health stats.

## Deploying

```sh
npm install
npm run deploy        # deploys the nitterts-health Worker first, then Pages
```

For local development, fill in `.dev.vars` and run `npm run dev`.

## Environment variables (plain vars)

Set them in `wrangler.jsonc` under `vars` or in the Pages dashboard. They act as
instance-level defaults; user cookies still win.

| Variable | Default | Description |
|---|---|---|
| `NITTER_REPLACE_TWITTER` | `nitterts.pages.dev` | Rewrite target for twitter.com links in tweets |
| `NITTER_REPLACE_YOUTUBE` | empty | Rewrite target for YouTube links (empty disables) |
| `NITTER_REPLACE_REDDIT` | empty | Rewrite target for Reddit links (empty disables) |
| `NITTER_PROXY_VIDEOS` | `false` | Proxy videos through this instance (`false` serves video.twimg.com directly) |
| `NITTER_HLS_PLAYBACK` | `false` | Enable HLS adaptive playback by default |
| `NITTER_THEME` | `Auto` | Default theme; see the preferences page for the list |
| `NITTER_DEBUG` | unset | Set to `true` to expose the `/.sessions` debug endpoint |

## Secrets

```sh
npx wrangler pages secret put <NAME> --project-name nitterts
```

| Secret | Required | Description |
|---|---|---|
| `NITTER_SESSIONS` | yes | X cookie sessions, one NDJSON object per line: `{"kind":"cookie","username":"…","id":"…","auth_token":"…","ct0":"…"}` |
| `NITTER_HMAC_KEY` | no | HMAC key signing `/video` proxy URLs (e.g. `openssl rand -hex 32`); rotating it invalidates previously rendered video links |

## Architecture notes

- Health metrics live in a Durable Object on the separate `nitterts-health` Worker,
  bound from Pages via `script_name` (`HEALTH_METRICS`); when absent the app falls back
  to isolate-local stats.
- Upstream submodule: `git submodule update --init --recursive` (`npm run init:upstream`).
