import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, decodePreferences, encodePreferences, preferencesFromRequest } from "../src/preferences";
import { renderProfilePage, renderTweet } from "../src/render/profile";
import { renderHomePage } from "../src/render/home";
import { renderAboutPage } from "../src/render/about";
import { renderStatusPage } from "../src/render/status";
import { serveResetPreferences, serveSavePreferences, serveSettingsPage } from "../src/serve/settings";

const profile = {
  id: "1",
  username: "alice",
  name: "Alice",
  bio: "",
  bioLinks: [],
  avatar: "https://pbs.twimg.com/alice.jpg",
  banner: "https://pbs.twimg.com/banner.jpg",
  location: "",
  website: "",
  joinedAt: "",
  followers: 0,
  following: 0,
  tweets: 0,
  media: 0,
  likes: 0,
  protected: false,
  blueVerified: false,
  verifiedType: "none" as const,
  suspended: false,
};

function tweet(id: string, pinned = false) {
  return {
    id,
    conversationId: id,
    text: `tweet ${id}`,
    createdAt: "Wed Aug 26 12:00:00 +0000 2026",
    author: { id: "1", username: "alice", name: "Alice", avatar: "https://pbs.twimg.com/alice.jpg", blueVerified: false, verifiedType: "none" as const },
    replies: 1,
    retweets: 2,
    likes: 3,
    views: 4,
    replyTo: [],
    media: [],
    links: [],
    pinned,
  };
}

describe("preferences", () => {
  it("round-trips the strict versioned cookie and falls back on malformed values", () => {
    const preferences = { ...DEFAULT_PREFERENCES, hideBanner: true, squareAvatars: true };
    expect(decodePreferences(encodePreferences(preferences))).toEqual(preferences);
    expect(decodePreferences("v2.zzz")).toEqual(DEFAULT_PREFERENCES);
    expect(decodePreferences("v1.0")).toEqual({
      stickyNav: false,
      stickyProfile: false,
      hideTweetStats: false,
      hideBanner: false,
      hidePins: false,
      hideReplies: false,
      squareAvatars: false,
      mp4Playback: false,
      muteVideos: false,
      autoplayGifs: false,
      compactGallery: false,
      mediaView: "grid",
      gallerySize: "medium",
    });
    expect(preferencesFromRequest(new Request("https://nitter.test", { headers: { cookie: `other=x; nitter_prefs=${encodePreferences(preferences)}` } }))).toEqual(preferences);
  });

  it("saves and resets preferences with secure same-origin cookies", async () => {
    const headers = {
      origin: "https://nitter.test",
      "content-type": "application/x-www-form-urlencoded",
      "sec-fetch-site": "same-origin",
    };
    const saved = await serveSavePreferences(new Request("https://nitter.test/settings", {
      method: "POST",
      headers,
      body: "stickyNav=on&hideBanner=on&squareAvatars=on&mediaView=Gallery&gallerySize=Large&returnTo=%2Falice",
    }));
    expect(saved.status).toBe(303);
    expect(saved.headers.get("location")).toBe("https://nitter.test/alice");
    expect(saved.headers.get("set-cookie")).toMatch(/^nitter_prefs=v2\.[0-9a-z]+\.a\.l; Path=\/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure$/);

    const reset = await serveResetPreferences(new Request("https://nitter.test/settings/reset", {
      method: "POST",
      headers,
      body: "returnTo=%2Fsettings",
    }));
    expect(reset.status).toBe(303);
    expect(reset.headers.get("set-cookie")).toContain("Max-Age=0");

    const rejected = await serveSavePreferences(new Request("https://nitter.test/settings", {
      method: "POST",
      headers: { ...headers, origin: "https://evil.test" },
      body: "stickyNav=on",
    }));
    expect(rejected.status).toBe(403);

    const redirectAttack = await serveSavePreferences(new Request("https://nitter.test/settings", {
      method: "POST",
      headers,
      body: "stickyNav=on&returnTo=%2F%09%2Fevil.test",
    }));
    expect(redirectAttack.headers.get("location")).toBe("https://nitter.test/settings");

    const proxied = await serveSavePreferences(new Request("http://nitter.test/settings", {
      method: "POST",
      headers: { ...headers, origin: "https://nitter.test", "x-forwarded-proto": "http,HTTPS" },
      body: "stickyNav=on&returnTo=%2Fsettings",
    }));
    expect(proxied.status).toBe(303);
    expect(proxied.headers.get("location")).toBe("https://nitter.test/settings");
    expect(proxied.headers.get("set-cookie")).toContain("; Secure");

    const proxiedAttack = await serveSavePreferences(new Request("http://nitter.test/settings", {
      method: "POST",
      headers: { ...headers, origin: "https://evil.test", "x-forwarded-proto": "https" },
      body: "stickyNav=on",
    }));
    expect(proxiedAttack.status).toBe(403);

    const nullOrigin = await serveSavePreferences(new Request("https://nitter.test/settings", {
      method: "POST",
      headers: { ...headers, origin: "null", "sec-fetch-site": "same-origin" },
      body: "stickyNav=on&returnTo=%2Fsettings",
    }));
    expect(nullOrigin.status).toBe(303);

    const nullOriginCrossSite = await serveSavePreferences(new Request("https://nitter.test/settings", {
      method: "POST",
      headers: { ...headers, origin: "null", "sec-fetch-site": "cross-site" },
      body: "stickyNav=on",
    }));
    expect(nullOriginCrossSite.status).toBe(403);

    const nullOriginNoFetchSite = await serveSavePreferences(new Request("https://nitter.test/settings", {
      method: "POST",
      headers: { origin: "null", "content-type": "application/x-www-form-urlencoded" },
      body: "stickyNav=on",
    }));
    expect(nullOriginNoFetchSite.status).toBe(403);

    const invalidChoice = await serveSavePreferences(new Request("https://nitter.test/settings", {
      method: "POST",
      headers,
      body: "mediaView=Cards&gallerySize=Medium",
    }));
    expect(invalidChoice.status).toBe(400);

    const oversized = await serveSavePreferences(new Request("https://nitter.test/settings", {
      method: "POST",
      headers,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(`stickyNav=on&returnTo=/${"x".repeat(9_000)}`));
          controller.close();
        },
      }),
      duplex: "half",
    } as RequestInit));
    expect(oversized.status).toBe(413);
  });

  it("renders settings and applies all supported display preferences", async () => {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      stickyNav: false,
      stickyProfile: false,
      hideTweetStats: true,
      hideBanner: true,
      hidePins: true,
      hideReplies: true,
      squareAvatars: true,
      mp4Playback: false,
      muteVideos: true,
      autoplayGifs: false,
    };
    const cookie = `nitter_prefs=${encodePreferences(preferences)}`;
    const settings = serveSettingsPage(new Request("https://nitter.test/settings?referer=%2Falice", { headers: { cookie } }));
    const settingsHtml = await settings.text();
    expect(settings.headers.get("cache-control")).toBe("private, no-store");
    expect(settingsHtml).toContain('name="hideBanner" type="checkbox" checked');
    expect(settingsHtml).toContain('type="hidden" name="referer" value="/alice"');
    expect(settingsHtml).toContain("<legend>Display</legend>");
    expect(settingsHtml).toContain("<legend>Media</legend>");
    expect(settingsHtml).toContain('class="pref-submit" type="submit">Save preferences');
    expect(settingsHtml).toContain('<form class="pref-reset" method="post" action="/resetprefs">');
    expect(settingsHtml).toContain('title="stickyNav"');
    expect(settingsHtml).toContain("Keep navbar fixed to top");
    expect(settingsHtml).toContain('name="mediaView" id="mediaView"');
    expect(settingsHtml).toContain('<option value="Grid" selected>Grid</option>');

    const html = renderProfilePage(profile, { tweets: [tweet("2"), tweet("1")], pinned: tweet("1", true) }, "tweets", [], preferences);
    expect(html).toContain("<body>");
    expect(html).not.toContain('class="profile-banner"');
    expect(html).not.toContain('profile-tab sticky');
    expect(html).not.toContain("tweet 1");
    expect(html).not.toContain('class="tweet-stats"');
    expect(html).not.toContain('class="avatar round"');
    expect(html).toContain('<div class="timeline-item tweet">');
    expect(html).not.toContain('<article class="timeline-item');
    expect(renderHomePage(preferences)).toContain("<body>");
    expect(renderHomePage(DEFAULT_PREFERENCES)).toContain('<body class="fixed-nav">');
    expect(renderHomePage(preferences)).toContain('/settings?referer=%2F');
    expect(renderAboutPage(profile, preferences)).toContain('class="avatar"');
    expect(renderAboutPage(profile, preferences)).not.toContain('avatar round');

    const status = renderStatusPage({ tweet: tweet("2"), before: [], after: [], replies: [[tweet("3")]] }, preferences);
    expect(status).not.toContain('class="replies"');
    const statusWithReplies = renderStatusPage({ tweet: tweet("2"), before: [], after: [], replies: [[tweet("3")]] }, { ...preferences, hideReplies: false });
    expect(statusWithReplies).toContain('class="timeline-item tweet thread-last"');

    const videoTweet = { ...tweet("4"), media: [{ kind: "video" as const, url: "https://video.twimg.com/video.mp4", preview: "https://pbs.twimg.com/video.jpg", alt: "" }] };
    const disabledVideo = renderTweet(videoTweet, false, preferences);
    expect(disabledVideo).not.toContain("<video");
    expect(disabledVideo).toContain('href="/media?url=https%3A%2F%2Fvideo.twimg.com%2Fvideo.mp4"');
    const enabled = { ...preferences, mp4Playback: true, muteVideos: true };
    expect(renderTweet(videoTweet, false, enabled)).toContain("<video controls muted playsinline");
    expect(renderTweet(videoTweet, false, enabled)).toContain('class="gallery-row mixed-row"');

    const paged = renderProfilePage(profile, { tweets: [] }, "tweets", [], preferences, "page cursor");
    expect(paged).toContain("referer=%2Falice%3Fcursor%3Dpage%2520cursor");

    const mediaTimeline = { tweets: [videoTweet], cursor: "next page" };
    const grid = renderProfilePage(profile, mediaTimeline, "media", [], preferences);
    expect(grid).toContain('class="timeline media-grid-view"');
    expect(grid).toContain('class="tab media-view-tabs"');
    expect(grid).toContain('/alice/media?cursor=next%20page&amp;view=grid');

    const galleryPreferences = { ...preferences, compactGallery: true, mediaView: "gallery" as const, gallerySize: "large" as const };
    const gallery = renderProfilePage(profile, mediaTimeline, "media", [], galleryPreferences);
    expect(gallery).toContain('class="profile-tabs media-only"');
    expect(gallery).toContain('class="gallery-masonry compact" data-col-size="large"');
    expect(gallery).not.toContain('class="profile-card"');
    expect(gallery).not.toContain('class="profile-banner"');
  });
});
