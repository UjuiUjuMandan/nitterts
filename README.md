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
| `NITTER_HMAC_KEY` | no | HMAC key signing `/video` proxy URLs (e.g. `openssl rand -hex 32`); rotating it invalidates previously rendered video links. Also derives the anonymous session labels shown on `/settings/sessions` |

## Visitor session donations (`/settings/sessions`)

Visitors can donate their own X cookie sessions through the `/settings/sessions`
page, managed alongside the operator sessions from `NITTER_SESSIONS`:

- **Pool view** — all live sessions with anonymous labels (`anon-…`), health
  status, and account age. X ids and usernames are never rendered; labels are
  HMACs keyed with the instance secrets, so they cannot be matched to accounts
  by outsiders (rotating `NITTER_HMAC_KEY` or `NITTER_SESSIONS` relabels).
- **Donations** — visitors paste `auth_token` and `ct0` cookies plus the
  username. The session is verified live against X before being stored (which
  also derives the account id; wrong or logged-out cookies are rejected).
- **Visibility** — donors choose per session whether it serves *all visitors*
  (public) or *only their own requests* (private). Private sessions are used
  first for the donating browser's traffic and are invisible to everyone else.
- **Management** — donors toggle visibility or remove sessions at any time.
  Ownership is an anonymous random token in an HttpOnly cookie; no accounts,
  no IPs stored. Clearing that cookie loses management access (logging the
  session out on X invalidates it everywhere as a last resort).

Donations require an optional KV namespace binding:

```sh
npx wrangler kv namespace create SESSION_STORE
# then uncomment "kv_namespaces" in wrangler.jsonc with the printed id
```

Without the binding the instance behaves exactly as before (operator sessions
only) and the page shows donations as disabled. Donated sessions live in one
KV record per donor (`owner/<token>`), so management is a single-key operation
and a fresh donation may take up to ~60s to serve other visitors (KV list
eventual consistency). `/.health` aggregates the shared pool; `/.sessions`
(operator, `NITTER_DEBUG=true`) reports everything including private sessions.

## Architecture notes

- Health metrics live in a Durable Object on the separate `nitterts-health` Worker,
  bound from Pages via `script_name` (`HEALTH_METRICS`); when absent the app falls back
  to isolate-local stats.
- Upstream submodule: `git submodule update --init --recursive` (`npm run init:upstream`).
