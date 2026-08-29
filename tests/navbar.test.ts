import { describe, expect, it } from "vitest";
import { onRequestGet as serveAbout } from "../functions/about";
import { INSTANCE_COMMIT_URL, INSTANCE_VERSION } from "../src/generated/version";
import { DEFAULT_PREFERENCES } from "../src/preferences";
import { renderErrorPage, renderNavbar } from "../src/render/profile";
import { renderSearchPage } from "../src/render/search";

describe("right navbar", () => {
  it("renders every upstream action with page context", () => {
    const html = renderNavbar("/alice", "/alice/media?cursor=next");
    expect(html).toContain('class="icon-search" title="Search" href="/search"');
    expect(html).toContain('class="icon-rss" title="RSS Feed" href="/alice/rss"');
    expect(html).toContain('class="icon-bird" title="Open in X" href="https://x.com/alice/media"');
    expect(html).toContain('href="https://liberapay.com/zedeus" title="Donate on Liberapay"');
    expect(html).toContain('<svg class="lp"');
    expect(html).toContain('class="icon-info" title="About" href="/about"');
    expect(html).toContain('class="icon-cog" title="Preferences" href="/settings?referer=%2Falice%2Fmedia%3Fcursor%3Dnext"');
  });

  it("maps Nitter search filters to X search parameters", () => {
    const html = renderSearchPage({
      query: "cats",
      kind: "tweets",
      username: "alice",
      since: "2026-01-01",
      until: "2026-02-01",
      minLikes: "10",
    }, undefined, undefined, [], { ...DEFAULT_PREFERENCES });
    expect(html).toContain('href="https://x.com/search?f=live&amp;q=%28from%3Aalice%29+include%3Anativeretweets+since%3A2026-01-01+until%3A2026-02-01+min_faves%3A10+cats&amp;src=typed_query"');

    const users = renderSearchPage({ query: "alice", kind: "users" }, undefined, undefined, [], { ...DEFAULT_PREFERENCES });
    expect(users).toContain('href="https://x.com/search?f=user&amp;q=alice&amp;src=typed_query"');

    const media = renderSearchPage({ query: "cats", kind: "media", username: "alice" }, undefined, undefined, [], { ...DEFAULT_PREFERENCES });
    expect(media).toContain('q=%28from%3Aalice%29+%28filter%3Aself_threads+OR+-filter%3Areplies%29+include%3Anativeretweets+cats');
  });

  it("keeps request context on error-page actions", () => {
    const html = renderErrorPage("Missing", 404, "/alice?cursor=next");
    expect(html).toContain('class="icon-bird" title="Open in X" href="https://x.com/alice"');
    expect(html).toContain('/settings?referer=%2Falice%3Fcursor%3Dnext');

    const search = renderErrorPage("Unavailable", 502, "/search?q=cats", "https://x.com/search?f=live&q=cats");
    expect(search).toContain('href="https://x.com/search?f=live&amp;q=cats"');
  });

  it("serves the global About destination with preferences", async () => {
    const response = await serveAbout({
      request: new Request("https://nitter.test/about", { headers: { cookie: "theme=Dracula" } }),
    } as never);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain("<h1>About</h1>");
    expect(html).toContain("Nitter is a free and open source alternative X front-end");
    expect(html).toContain('/css/themes/dracula.css"');
    expect(html).toContain('class="icon-info" title="About" href="/about"');
    expect(INSTANCE_VERSION).toMatch(/^\d{4}\.\d{2}\.\d{2}-[0-9a-f]+$/);
    expect(html).toContain(`<p>Version <a href="${INSTANCE_COMMIT_URL}">${INSTANCE_VERSION}</a></p>`);
  });
});
