import { expect, it } from "vitest";
import { onRequestGet as profileRss } from "../functions/[username]/rss";
import { onRequestGet as listRss } from "../functions/i/lists/[id]/rss";
import { onRequestGet as listSlugRss } from "../functions/[username]/lists/[slug]/rss";

it.each([
  ["/alice/rss", profileRss, { username: "alice" }, { username: "!" }],
  ["/i/lists/99/rss", listRss, { id: "99" }, { id: "invalid" }],
  ["/alice/lists/news/rss", listSlugRss, { username: "alice", slug: "news" }, { username: "!", slug: "news" }],
] as const)("gates %s behind NITTER_ENABLE_RSS", async (path, handler, params, invalidParams) => {
  const request = new Request(`https://nitter.test${path}`);
  for (const env of [{}, { NITTER_ENABLE_RSS: "false" }]) {
    const response = await handler({ request, env, params } as never);
    expect(response.status).toBe(404);
  }

  const enabled = await handler({ request, env: { NITTER_ENABLE_RSS: "true" }, params: invalidParams } as never);
  expect(enabled.status).toBe(400);
});
