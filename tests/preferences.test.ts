import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCES, encodePrefs, preferencesCookies, preferencesFromBookmark, preferencesFromRequest, preferencesRedirect } from "../src/preferences";
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

function cookieHeader(preferences: typeof DEFAULT_PREFERENCES): string {
  return preferencesCookies(preferences, true)
    .filter((cookie) => !cookie.includes("Max-Age=0"))
    .map((cookie) => cookie.split(";", 1)[0])
    .join("; ");
}

describe("preferences", () => {
  it("uses upstream per-preference cookies, bookmarks, and temporary query overrides", () => {
    const preferences = {
      ...DEFAULT_PREFERENCES,
      hideBanner: true,
      squareAvatars: true,
      theme: "Auto (Twitter)" as const,
      replaceTwitter: "nitter.example",
    };
    const bookmark = "hideBanner=on,squareAvatars=on,theme=Auto (Twitter),replaceTwitter=nitter.example";
    expect(encodePrefs(preferences)).toBe(bookmark);
    expect(preferencesFromBookmark(bookmark)).toEqual(preferences);
    expect(preferencesFromRequest(new Request("https://nitter.test", { headers: { cookie: cookieHeader(preferences) } }))).toEqual(preferences);
    expect(preferencesFromRequest(new Request("https://nitter.test?hideBanner=&theme=Dracula", {
      headers: { cookie: "hideBanner=on; theme=Neon; mediaView=cards" },
    }))).toMatchObject({ hideBanner: false, theme: "Dracula", mediaView: "grid" });

    const redirect = preferencesRedirect(new Request(`https://nitter.test/alice?prefs=${encodeURIComponent(bookmark)}&q=test`));
    expect(redirect?.status).toBe(303);
    expect(redirect?.headers.get("location")).toBe("https://nitter.test/alice?q=test");
    expect(redirect?.headers.get("set-cookie")).toContain("hideBanner=on; Path=/; Max-Age=31536000");
    expect(redirect?.headers.get("set-cookie")).toContain("stickyNav=; Path=/; Max-Age=0");
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
      body: "stickyNav=on&stickyProfile=on&hideBanner=on&squareAvatars=on&mp4Playback=on&proxyVideos=on&autoplayGifs=on&hideRelated=on&mediaView=Gallery&gallerySize=Large&theme=Dracula&returnTo=%2Falice",
    }));
    expect(saved.status).toBe(303);
    expect(saved.headers.get("location")).toBe("https://nitter.test/alice");
    expect(saved.headers.get("set-cookie")).toContain("hideBanner=on; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure");
    expect(saved.headers.get("set-cookie")).toContain("mediaView=gallery; Path=/; Max-Age=31536000");
    expect(saved.headers.get("set-cookie")).toContain("stickyNav=; Path=/; Max-Age=0");
    expect(saved.headers.get("set-cookie")).not.toContain("nitter_prefs");

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

    const invalidTheme = await serveSavePreferences(new Request("https://nitter.test/settings", {
      method: "POST",
      headers,
      body: "theme=Neon",
    }));
    expect(invalidTheme.status).toBe(400);

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
    const cookie = cookieHeader(preferences);
    const settings = serveSettingsPage(new Request("https://nitter.test/settings?referer=%2Falice", { headers: { cookie } }));
    const settingsHtml = await settings.text();
    expect(settings.headers.get("cache-control")).toBe("private, no-store");
    expect(settings.headers.get("content-security-policy")).toContain("worker-src 'self' blob:");
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
    expect(settingsHtml).toContain('name="theme" id="theme"');
    expect(settingsHtml).toContain('<option value="Auto (Twitter)">Auto (Twitter)</option>');
    expect(settingsHtml).toContain('title="bidiSupport"');
    expect(settingsHtml).toContain("Support bidirectional text (makes clicking on tweets harder)");
    expect(settingsHtml).toContain('name="hideRelated" type="checkbox" checked');
    expect(settingsHtml).toContain("Hide related tweets under replies");
    expect(settingsHtml).toContain('name="hideCommunityNotes" type="checkbox"');
    expect(settingsHtml).toContain('name="hlsPlayback" type="checkbox"');
    expect(settingsHtml).toContain('name="proxyVideos" type="checkbox" checked');
    expect(settingsHtml).toContain('name="infiniteScroll" type="checkbox"');
    expect(settingsHtml).toContain('name="replaceTwitter" id="replaceTwitter"');
    expect(settingsHtml).toContain("<legend>Bookmark</legend>");
    expect(settingsHtml).toContain("https://nitter.test/?prefs=stickyNav=,stickyProfile=,hideTweetStats=on,hideBanner=on");

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
    expect(renderHomePage(preferences)).toContain("/settings?referer=%2F");
    expect(renderHomePage(DEFAULT_PREFERENCES)).toContain('/css/themes/nitter.css"');
    expect(renderHomePage({ ...DEFAULT_PREFERENCES, theme: "Twitter Dark" })).toContain('/css/themes/twitter_dark.css"');

    const bidi = renderTweet(tweet("9"), false, { ...DEFAULT_PREFERENCES, bidiSupport: true });
    expect(bidi).toContain('class="tweet-content media-body tweet-bidi"');
    expect(renderAboutPage(profile, preferences)).toContain('class="avatar"');
    expect(renderAboutPage(profile, preferences)).not.toContain('avatar round');

    const webProfile = { ...profile, website: "https://youtube.com/@cocomin0219?si=wq5YtNNKiWdg3aY4" };
    const webHtml = renderProfilePage(webProfile, { tweets: [] }, "tweets", [], preferences);
    expect(webHtml).toContain('<a href="https://youtube.com/@cocomin0219?si=wq5YtNNKiWdg3aY4"');
    expect(webHtml).toContain(">youtube.com/@cocomin0219?si=…</a>");

    const accountInfo = {
      username: "alice",
      name: "Alice",
      avatar: "",
      joinedAt: "",
      verifiedType: "none" as const,
      suspended: false,
      basedIn: "Japan",
      source: "Japan App Store",
      usernameChanges: 1,
      lastUsernameChangeAt: Date.UTC(2023, 10, 19),
      affiliateUsername: "",
      affiliateLabel: "",
      isIdentityVerified: false,
      verifiedSinceAt: 0,
      overrideVerifiedYear: 0,
    };
    const about = renderAboutPage({ ...profile, basedIn: "Japan" }, preferences, accountInfo);
    expect(about).toContain("Account based in");
    expect(about).toContain("1 username change");
    expect(about).toContain("Last on November 2023");
    expect(about).toContain("Connected via");
    expect(about).toContain("Japan App Store");

    const status = renderStatusPage({ tweet: tweet("2"), before: [], after: [], replies: [[tweet("3")]], related: [] }, preferences);
    expect(status).not.toContain('class="replies"');
    const statusWithReplies = renderStatusPage({ tweet: tweet("2"), before: [], after: [], replies: [[tweet("3")]], related: [] }, { ...preferences, hideReplies: false });
    expect(statusWithReplies).toContain('class="timeline-item tweet thread-last"');
    expect(statusWithReplies).toContain('class="icon-bird" title="Open in X" href="https://x.com/alice/status/2"');
    expect(statusWithReplies).toContain('/settings?referer=%2Falice%2Fstatus%2F2%23m');

    const videoTweet = { ...tweet("4"), media: [{ kind: "video" as const, url: "https://video.twimg.com/video.mp4", preview: "https://pbs.twimg.com/video.jpg", alt: "" }] };
    const disabledVideo = renderTweet(videoTweet, false, preferences);
    expect(disabledVideo).not.toContain("<video");
    expect(disabledVideo).toContain('href="/media?url=https%3A%2F%2Fvideo.twimg.com%2Fvideo.mp4"');
    const enabled = { ...preferences, mp4Playback: true, proxyVideos: false, muteVideos: true };
    expect(renderTweet(videoTweet, false, enabled)).toContain("<video controls muted playsinline");
    expect(renderTweet(videoTweet, false, enabled)).toContain('src="https://video.twimg.com/video.mp4"');
    expect(renderTweet(videoTweet, false, enabled)).toContain('class="gallery-row mixed-row"');

    const hlsTweet = { ...videoTweet, media: [{ ...videoTweet.media[0]!, hls: "https://video.twimg.com/master.m3u8" }] };
    const hls = { ...preferences, hlsPlayback: true };
    expect(renderTweet(hlsTweet, false, hls)).toContain('data-url="/media?url=https%3A%2F%2Fvideo.twimg.com%2Fmaster.m3u8"');
    expect(renderTweet(hlsTweet, false, hls)).toContain('onclick="playVideo(this)"');
    expect(renderProfilePage(profile, { tweets: [hlsTweet] }, "tweets", [], hls)).toContain('<script src="/js/hls.min.js" defer></script>');
    expect(renderProfilePage(profile, { tweets: [] }, "tweets", [], { ...preferences, infiniteScroll: true })).toContain('<script src="/js/infiniteScroll.js" defer></script>');

    const linkedTweet = {
      ...tweet("5"),
      text: "watch",
      links: [{ kind: "url" as const, start: 0, end: 5, display: "watch", url: "https://youtube.com/watch?v=1" }],
    };
    expect(renderTweet(linkedTweet, false, { ...preferences, replaceYouTube: "piped.example" })).toContain('href="https://piped.example/watch?v=1"');
    const unrelatedLink = { ...linkedTweet, links: [{ ...linkedTweet.links[0]!, url: "https://notyoutube.com/watch?v=1" }] };
    expect(renderTweet(unrelatedLink, false, { ...preferences, replaceYouTube: "piped.example" })).toContain('href="https://notyoutube.com/watch?v=1"');
    const fakeTwitter = { ...linkedTweet, links: [{ ...linkedTweet.links[0]!, url: "https://twitter.com.evil/watch" }] };
    expect(renderTweet(fakeTwitter, false, { ...preferences, replaceTwitter: "nitter.example" })).toContain('href="https://twitter.com.evil/watch"');
    const fakeReddit = { ...linkedTweet, links: [{ ...linkedTweet.links[0]!, url: "https://reddit.com.evil/watch" }] };
    expect(renderTweet(fakeReddit, false, { ...preferences, replaceReddit: "libreddit.example" })).toContain('href="https://reddit.com.evil/watch"');

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
