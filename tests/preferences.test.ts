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
      body: "stickyNav=on&hideBanner=on&squareAvatars=on&returnTo=%2Falice",
    }));
    expect(saved.status).toBe(303);
    expect(saved.headers.get("location")).toBe("https://nitter.test/alice");
    expect(saved.headers.get("set-cookie")).toMatch(/^nitter_prefs=v1\.[0-9a-z]+; Path=\/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure$/);

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
    expect(settingsHtml).toContain('name="hideBanner" checked');
    expect(settingsHtml).toContain('name="returnTo" value="/alice"');

    const html = renderProfilePage(profile, { tweets: [tweet("2"), tweet("1")], pinned: tweet("1", true) }, "tweets", [], preferences);
    expect(html).toContain('<body class="non-sticky-nav">');
    expect(html).not.toContain('class="profile-banner"');
    expect(html).not.toContain('profile-tab sticky');
    expect(html).not.toContain("tweet 1");
    expect(html).not.toContain('class="tweet-stats"');
    expect(html).not.toContain('class="avatar round"');
    expect(renderHomePage(preferences)).toContain('<body class="non-sticky-nav">');
    expect(renderHomePage(preferences)).toContain('/settings?referer=%2F');
    expect(renderAboutPage(profile, preferences)).toContain('class="avatar"');
    expect(renderAboutPage(profile, preferences)).not.toContain('avatar round');

    const status = renderStatusPage({ tweet: tweet("2"), before: [], after: [], replies: [[tweet("3")]] }, preferences);
    expect(status).not.toContain('class="replies"');

    const videoTweet = { ...tweet("4"), media: [{ kind: "video" as const, url: "https://video.twimg.com/video.mp4", preview: "https://pbs.twimg.com/video.jpg", alt: "" }] };
    const disabledVideo = renderTweet(videoTweet, false, preferences);
    expect(disabledVideo).not.toContain("<video");
    expect(disabledVideo).toContain('href="/media?url=https%3A%2F%2Fvideo.twimg.com%2Fvideo.mp4"');
    const enabled = { ...preferences, mp4Playback: true, muteVideos: true };
    expect(renderTweet(videoTweet, false, enabled)).toContain("<video controls muted playsinline");

    const paged = renderProfilePage(profile, { tweets: [] }, "tweets", [], preferences, "page cursor");
    expect(paged).toContain("referer=%2Falice%3Fcursor%3Dpage%2520cursor");
  });
});
