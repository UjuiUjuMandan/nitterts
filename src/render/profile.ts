import { mediaProxyUrl } from "../media";
import { bodyClass, DEFAULT_PREFERENCES, themeSlug, type MediaView, type PagePreferences } from "../preferences";
import type { Profile } from "../x/profile";
import type { PhotoRailItem, ProfileTab, Timeline, Tweet, TweetLink, VerifiedType } from "../x/timeline";

const TAB_PATHS: Record<ProfileTab, string> = {
  tweets: "",
  replies: "/with_replies",
  media: "/media",
};

export function renderProfilePage(
  profile: Profile,
  timeline: Timeline,
  tab: ProfileTab = "tweets",
  photos: PhotoRailItem[] = [],
  preferences: PagePreferences = { ...DEFAULT_PREFERENCES },
  currentCursor?: string,
  mediaView: MediaView = preferences.mediaView,
): string {
  const title = `${profile.name} (@${profile.username}) | nitter`;
  const base = `/${encodeURIComponent(profile.username)}`;
  const tweets = [preferences.hidePins ? undefined : timeline.pinned, ...timeline.tweets]
    .filter((tweet): tweet is Tweet => Boolean(tweet))
    .filter((tweet) => !preferences.hidePins || (!tweet.pinned && tweet.id !== timeline.pinned?.id))
    .filter((tweet, index, all) => all.findIndex((item) => item.id === tweet.id) === index)
    .map((tweet) => renderTweet(tweet, false, preferences))
    .join("");
  const activeMediaView = tab === "media" ? mediaView : "timeline";
  const moreQuery = [`cursor=${encodeURIComponent(timeline.cursor ?? "")}`];
  if (tab === "media") moreQuery.push(`view=${activeMediaView}`);
  const more = timeline.cursor
    ? `<div class="show-more"><a href="${escapeAttribute(`${base}${TAB_PATHS[tab]}?${moreQuery.join("&")}`)}">Load more</a></div>`
    : "";
  const timelineBody = profile.suspended
    ? '<div class="timeline-header timeline-message"><h2>This account is suspended.</h2></div>'
    : profile.protected
      ? `<div class="timeline-header timeline-message"><h2>This account's tweets are protected.</h2><p>Only confirmed followers have access to @${escapeHtml(profile.username)}'s tweets.</p></div>`
      : tweets || '<div class="timeline-header timeline-message"><h2>No tweets found.</h2></div>';
  const gallery = tab === "media" && activeMediaView === "gallery";
  const renderedTimeline = gallery && tweets
    ? `<div class="gallery-masonry${preferences.compactGallery ? " compact" : ""}" data-col-size="${preferences.gallerySize}">${timelineBody}</div>`
    : timelineBody;
  const currentQuery: string[] = [];
  if (currentCursor) currentQuery.push(`cursor=${encodeURIComponent(currentCursor)}`);
  if (tab === "media") currentQuery.push(`view=${activeMediaView}`);
  const currentPath = `${base}${TAB_PATHS[tab]}${currentQuery.length ? `?${currentQuery.join("&")}` : ""}`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeAttribute(profile.bio || `Posts by @${profile.username}`)}">
  <meta name="theme-color" content="#1f1f1f">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/css/fontello.css">
  <link rel="stylesheet" href="/css/style.css">${themeLink(preferences)}${headScripts(preferences)}
  <link rel="alternate" type="application/rss+xml" href="/${encodeURIComponent(profile.username)}/rss" title="RSS feed">
</head>
<body${bodyClass(preferences)}>
  ${renderNavbar(base, currentPath)}
  <div class="container">
    <main class="profile-tabs${gallery ? " media-only" : ""}">
      ${gallery || !profile.banner || preferences.hideBanner ? "" : `<div class="profile-banner"><a href="${escapeAttribute(mediaProxyUrl(profile.banner))}" target="_blank" rel="noopener" aria-label="Open banner image"><img src="${escapeAttribute(mediaProxyUrl(profile.banner))}" alt=""></a></div>`}
      ${gallery ? "" : `<aside class="profile-tab${preferences.stickyProfile ? " sticky" : ""}">${renderProfileCard(profile, preferences)}${renderPhotoRail(profile, photos)}</aside>`}
      <section class="timeline-container${gallery ? " media-only" : ""}">
        ${gallery ? "" : `<ul class="tab">
          <li class="tab-item${tab === "tweets" ? " active" : ""}"><a href="${base}">Tweets</a></li>
          <li class="tab-item wide${tab === "replies" ? " active" : ""}"><a href="${base}/with_replies">Tweets &amp; Replies</a></li>
          <li class="tab-item${tab === "media" ? " active" : ""}"><a href="${base}/media">Media</a></li>
          <li class="tab-item"><a href="${base}/search">Search</a></li>
        </ul>`}
        ${tab === "media" ? renderMediaViewTabs(base, activeMediaView) : ""}
        <div class="timeline${tab === "media" ? ` media-${activeMediaView}-view` : ""}">${renderedTimeline}${profile.protected || profile.suspended ? "" : more}<div class="timeline-footer"></div><div class="top-ref"><div class="icon-container"><a class="icon-down" href="#" title="Back to top"></a></div></div></div>
      </section>
    </main>
  </div>
</body>
</html>`;
}

function renderMediaViewTabs(base: string, active: MediaView): string {
  return `<ul class="tab media-view-tabs">${(["timeline", "grid", "gallery"] as const).map((view) => `<li class="tab-item${active === view ? " active" : ""}"><a href="${base}/media?view=${view}">${view[0]!.toUpperCase()}${view.slice(1)}</a></li>`).join("")}</ul>`;
}

export function themeLink(preferences: PagePreferences): string {
  return `\n  <link rel="stylesheet" href="${escapeAttribute(`/css/themes/${themeSlug(preferences.theme)}.css`)}">`;
}

export function headScripts(preferences: PagePreferences): string {
  let scripts = "";
  if (preferences.hlsPlayback) {
    scripts += '\n  <script src="/js/hls.min.js" defer></script>\n  <script src="/js/hlsPlayback.js?v=1" defer></script>';
  }
  if (preferences.infiniteScroll) {
    scripts += '\n  <script src="/js/infiniteScroll.js" defer></script>';
  }
  return scripts;
}

// Port of upstream replaceUrls (formatters.nim): swaps Twitter/YouTube/Reddit
// hosts in external URLs according to the link replacement preferences.
export function replaceUrl(url: string, preferences: PagePreferences): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const hostname = parsed.hostname.toLowerCase();
  const youtube = preferences.replaceYouTube.replace(/\/+$/, "");
  if (youtube && (hostname === "youtu.be" || hostname === "youtube.com" || hostname.endsWith(".youtube.com"))) {
    parsed.host = youtube;
    return parsed.toString();
  }
  const twitter = preferences.replaceTwitter.replace(/\/+$/, "");
  if (twitter && ["twitter.com", "www.twitter.com", "mobile.twitter.com", "cards.twitter.com", "x.com", "www.x.com", "mobile.x.com"].includes(hostname)) {
    parsed.host = twitter;
    return parsed.toString();
  }
  const reddit = preferences.replaceReddit.replace(/\/+$/, "");
  if (reddit && (hostname === "redd.it" || ["reddit.com", "www.reddit.com", "np.reddit.com", "new.reddit.com", "amp.reddit.com", "old.reddit.com"].includes(hostname))) {
    if (hostname === "redd.it") parsed.pathname = `/comments${parsed.pathname}`;
    if (parsed.pathname.startsWith("/gallery/")) parsed.pathname = parsed.pathname.replace("/gallery/", "/comments/");
    parsed.host = reddit;
    return parsed.toString();
  }
  return url;
}

export function renderErrorPage(message: string, status: number, currentPath = "", canonical?: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${status} | nitter</title><link rel="stylesheet" href="/css/fontello.css"><link rel="stylesheet" href="/css/style.css"></head><body>${renderNavbar("", currentPath, canonical)}<div class="container"><main class="panel-container"><section class="error-panel"><h1>${status}</h1><p>${escapeHtml(message)}</p></section></main></div></body></html>`;
}

export function requestPath(request: Request): string {
  const url = new URL(request.url);
  return `${url.pathname}${url.search}`;
}

export function renderNavbar(rss = "", currentPath = "", canonical = xUrl(currentPath || "/")): string {
  const rssLink = rss ? `<div class="icon-container"><a class="icon-rss" title="RSS Feed" href="${escapeAttribute(rss)}/rss"></a></div>` : "";
  const settings = currentPath ? `/settings?referer=${encodeURIComponent(currentPath)}` : "/settings";
  return `<nav><div class="inner-nav"><div class="nav-item"><a class="site-name" href="/">nitter</a></div><a href="/"><img class="site-logo" src="/logo.png" alt="Logo"></a><div class="nav-item right"><div class="icon-container"><a class="icon-search" title="Search" href="/search"></a></div>${rssLink}<div class="icon-container"><a class="icon-bird" title="Open in X" href="${escapeAttribute(canonical)}"></a></div><a href="https://liberapay.com/zedeus" title="Donate on Liberapay">${LIBERAPAY_ICON}</a><div class="icon-container"><a class="icon-info" title="About" href="/about"></a></div><div class="icon-container"><a class="icon-cog" title="Preferences" href="${escapeAttribute(settings)}"></a></div></div></div></nav>`;
}

function xUrl(path: string): string {
  const url = new URL(path, "https://x.com");
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function renderProfileCard(profile: Profile, preferences: PagePreferences = { ...DEFAULT_PREFERENCES }): string {
  const avatar = profile.avatar
    ? `<a class="profile-card-avatar" href="${escapeAttribute(mediaProxyUrl(profile.avatar))}" target="_blank" rel="noopener" aria-label="Open ${escapeAttribute(profile.name)}'s profile image"><img src="${escapeAttribute(mediaProxyUrl(profile.avatar))}" alt=""></a>`
    : "";

  return `<section class="profile-card">
    <div class="profile-card-info">
      ${avatar}
      <div class="profile-card-tabs-name">
        <a class="profile-card-fullname" href="/${encodeURIComponent(profile.username)}">${escapeHtml(profile.name)}</a>${verifiedBadge(profile.verifiedType)}<a class="profile-card-username" href="/${encodeURIComponent(profile.username)}">@${escapeHtml(profile.username)}</a>
      </div>
    </div>
    <div class="profile-card-extra">
      ${profile.bio ? `<div class="profile-bio"><p dir="auto">${linkify(profile.bio, profile.bioLinks, preferences)}</p></div>` : ""}
      ${profile.location ? `<div class="profile-location"><span class="icon-location"></span><span>${escapeHtml(profile.location)}</span></div>` : ""}
      ${profile.basedIn ? `<div class="profile-location"><span class="icon-location"></span><span>Based in ${escapeHtml(profile.basedIn)}</span></div>` : ""}
      ${profile.website && /^https?:\/\//i.test(profile.website) ? `<div class="profile-website"><span class="icon-link"></span><a href="${escapeAttribute(replaceUrl(profile.website, preferences))}" target="_blank" rel="noopener">${escapeHtml(shortLink(replaceUrl(profile.website, preferences)))}</a></div>` : profile.website ? `<div class="profile-website"><span class="icon-link"></span><span>${escapeHtml(shortLink(profile.website))}</span></div>` : ""}
      ${profile.joinedAt ? `<div class="profile-joindate"><a href="/${encodeURIComponent(profile.username)}/about" title="${escapeAttribute(formatJoinDateFull(profile.joinedAt))}"><span class="icon-calendar"></span> ${escapeHtml(formatJoinDate(profile.joinedAt))}</a></div>` : ""}
      <div class="profile-card-extra-links">
        <ul class="profile-statlist">
          ${renderStat("Tweets", profile.tweets)}
          ${renderStat("Following", profile.following)}
          ${renderStat("Followers", profile.followers)}
          ${renderStat("Likes", profile.likes)}
        </ul>
      </div>
    </div>
  </section>`;
}

export function renderPhotoRail(profile: Profile, photos: PhotoRailItem[]): string {
  if (!photos.length) return "";
  const base = `/${encodeURIComponent(profile.username)}`;
  const grid = photos
    .map((photo) => `<a href="${base}/status/${encodeURIComponent(photo.tweetId)}#m"><img loading="lazy" src="${escapeAttribute(mediaProxyUrl(thumbUrl(photo.url)))}" alt=""></a>`)
    .join("");
  return `<section class="photo-rail-card">
    <div class="photo-rail-header"><a href="${base}/media"><div class="icon-container"><span class="icon-picture"></span> ${formatNumber(profile.media || photos.length)} Photos and videos</div></a></div>
    <input id="photo-rail-grid-toggle" type="checkbox">
    <label class="photo-rail-header-mobile" for="photo-rail-grid-toggle"><div class="icon-container"><span class="icon-picture"></span> ${formatNumber(profile.media || photos.length)} Photos and videos</div><div class="icon-container"><span class="icon-down"></span></div></label>
    <div class="photo-rail-grid">${grid}</div>
  </section>`;
}

export function renderUserResult(profile: Profile, preferences: PagePreferences = { ...DEFAULT_PREFERENCES }): string {
  const href = `/${encodeURIComponent(profile.username)}`;
  const avatar = profile.avatar
    ? `<a class="tweet-avatar" href="${href}"><img class="avatar${preferences.squareAvatars ? "" : " round"}" src="${escapeAttribute(mediaProxyUrl(profile.avatar))}" alt="" loading="lazy"></a>`
    : "";
  return `<div class="timeline-item" data-username="${escapeAttribute(profile.username)}">
    <a class="tweet-link" href="${href}" aria-label="View @${escapeAttribute(profile.username)} profile"></a>
    <div class="tweet-body profile-result">
      <div class="tweet-header">${avatar}<div class="tweet-name-row"><div class="fullname-and-username"><a class="fullname" href="${href}">${escapeHtml(profile.name)}</a>${verifiedBadge(profile.verifiedType)}</div></div><a class="username" href="${href}">@${escapeHtml(profile.username)}</a></div>
      ${profile.bio ? `<div class="tweet-content media-body" dir="auto">${linkify(profile.bio, profile.bioLinks, preferences)}</div>` : ""}
    </div>
  </div>`;
}

function thumbUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("name")) {
      parsed.searchParams.set("name", "thumb");
      return parsed.toString();
    }
  } catch {
    return url;
  }
  return /:(thumb|small|medium|large)$/.test(url) ? url : `${url}:thumb`;
}

export function renderTweet(source: Tweet, main = false, preferences: PagePreferences = { ...DEFAULT_PREFERENCES }, threadLast = false): string {
  const tweet = source.retweet ?? source;
  const context = source.retweet
    ? `<div class="retweet-header"><span><span class="icon-retweet"></span> ${escapeHtml(source.author.name)} retweeted</span></div>`
    : source.pinned
      ? '<div class="pinned"><span><span class="icon-pin"></span> Pinned Tweet</span></div>'
      : "";
  const media = renderMedia(tweet, preferences);
  const quote = tweet.quote ? renderQuote(tweet.quote, preferences) : "";

  const permalink = `/${encodeURIComponent(tweet.author.username)}/status/${encodeURIComponent(tweet.id)}`;
  return `<div class="timeline-item tweet${main ? " main-tweet-item" : ""}${threadLast ? " thread-last" : ""}">
    ${main ? "" : `<a class="tweet-link" href="${permalink}" aria-label="View post"></a>`}
    <div class="tweet-body">
      ${context}
      <div class="tweet-header">
        ${tweet.author.avatar ? `<a class="tweet-avatar" href="/${encodeURIComponent(tweet.author.username)}" aria-label="View @${escapeAttribute(tweet.author.username)} profile"><img class="avatar${preferences.squareAvatars ? "" : " round"}" src="${escapeAttribute(mediaProxyUrl(tweet.author.avatar))}" alt=""></a>` : ""}
        <div class="tweet-name-row">
          <div class="fullname-and-username"><a class="fullname" href="/${encodeURIComponent(tweet.author.username)}">${escapeHtml(tweet.author.name)}</a>${verifiedBadge(tweet.author.verifiedType)}<a class="username" href="/${encodeURIComponent(tweet.author.username)}">@${escapeHtml(tweet.author.username)}</a></div>
          <span class="tweet-date"><a href="${permalink}" title="${escapeAttribute(formatFullDate(tweet.createdAt))}">${escapeHtml(formatDate(tweet.createdAt))}</a></span>
        </div>
      </div>
      ${tweet.replyTo.length ? `<div class="replying-to">Replying to ${tweet.replyTo.map((name) => `@${escapeHtml(name)}`).join(" ")}</div>` : ""}
      <div class="tweet-content media-body${preferences.bidiSupport ? " tweet-bidi" : ""}" dir="auto">${linkify(tweet.text, tweet.links, preferences)}</div>
      ${media}
      ${quote}
      ${renderCommunityNote(tweet, preferences)}
      ${main ? `<p class="tweet-published">${escapeHtml(formatFullDate(tweet.createdAt))}</p>` : ""}
      ${preferences.hideTweetStats ? "" : `<div class="tweet-stats"><span class="tweet-stat"><div class="icon-container"><span class="icon-comment"></span> ${formatNumber(tweet.replies)}</div></span><span class="tweet-stat"><div class="icon-container"><span class="icon-retweet"></span> ${formatNumber(tweet.retweets)}</div></span><span class="tweet-stat"><div class="icon-container"><span class="icon-heart"></span> ${formatNumber(tweet.likes)}</div></span>${tweet.views ? `<span class="tweet-stat"><div class="icon-container"><span class="icon-views"></span> ${formatNumber(tweet.views)}</div></span>` : ""}</div>`}
    </div>
  </div>`;
}

function formatFullDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date);
  const time = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(date);
  return `${month} ${date.getUTCDate()}, ${date.getUTCFullYear()} · ${time} UTC`;
}

function renderMedia(tweet: Tweet, preferences: PagePreferences): string {
  if (!tweet.media.length) return "";
  const items = tweet.media
    .map((item) => {
      const image = item.kind === "photo" ? item.url : item.preview;
      if (!image) return "";
      const videoSrc = (url: string) => preferences.proxyVideos ? mediaProxyUrl(url) : url;
      if (item.kind === "photo") {
        return { kind: item.kind, html: `<a class="attachment still-image" href="${escapeAttribute(mediaProxyUrl(item.url))}" target="_blank" rel="noopener"><img loading="lazy" src="${escapeAttribute(mediaProxyUrl(image))}" alt="${escapeAttribute(item.alt)}"></a>` };
      }
      const directMp4 = item.kind === "video" && !preferences.proxyVideos && item.url;
      if (item.kind === "video" && (directMp4 || (preferences.hlsPlayback && item.hls))) {
        const source = videoSrc(directMp4 || item.hls || "");
        if (directMp4) {
          return { kind: item.kind, html: `<div class="attachment video-container"><video controls${preferences.muteVideos ? " muted" : ""} playsinline preload="metadata" poster="${escapeAttribute(mediaProxyUrl(image))}" aria-label="${escapeAttribute(item.alt || "Video")}"><source src="${escapeAttribute(source)}" type="video/mp4"></video></div>` };
        }
        return { kind: item.kind, html: `<div class="attachment video-container"><video data-url="${escapeAttribute(source)}" data-autoload="false"${preferences.muteVideos ? " muted" : ""} playsinline preload="metadata" poster="${escapeAttribute(mediaProxyUrl(image))}" aria-label="${escapeAttribute(item.alt || "Video")}"></video><div class="video-overlay" onclick="playVideo(this)"><div class="overlay-circle"><span class="overlay-triangle"></span></div></div></div>` };
      }
      if (item.kind === "gif" && item.url && preferences.mp4Playback) {
        const playback = preferences.autoplayGifs ? " autoplay muted loop" : " controls muted loop";
        return { kind: item.kind, html: `<div class="attachment video-container"><video${playback} playsinline preload="metadata" poster="${escapeAttribute(mediaProxyUrl(image))}" aria-label="${escapeAttribute(item.alt || (item.kind === "gif" ? "GIF" : "Video"))}"><source src="${escapeAttribute(videoSrc(item.url))}" type="video/mp4"></video></div>` };
      }
      const fallback = `<img loading="lazy" src="${escapeAttribute(mediaProxyUrl(image))}" alt="${escapeAttribute(item.alt)}"><span class="media-badge">${item.kind === "gif" ? "GIF" : "VIDEO"}</span>`;
      const html = item.url
        ? `<a class="attachment still-image" href="${escapeAttribute(videoSrc(item.url))}" target="_blank" rel="noopener">${fallback}</a>`
        : `<div class="attachment still-image">${fallback}</div>`;
      return { kind: item.kind, html };
    })
    .filter((item): item is { kind: "photo" | "video" | "gif"; html: string } => Boolean(item));
  if (!items.length) return "";
  if (items.length === 1 && items[0]!.kind === "gif") {
    return `<div class="attachments media-gif">${items[0]!.html}</div>`;
  }
  const split = items.length < 3 ? items.length : Math.ceil(items.length / 2);
  const groups = items.length < 3 ? [items] : [items.slice(0, split), items.slice(split)];
  const rows = groups.map((group) => `<div class="gallery-row${group.some((item) => item.kind !== "photo") ? " mixed-row" : ""}">${group.map((item) => item.html).join("")}</div>`).join("");
  return `<div class="attachments">${rows}</div>`;
}

function renderQuote(tweet: Tweet, preferences: PagePreferences): string {
  const permalink = `/${encodeURIComponent(tweet.author.username)}/status/${encodeURIComponent(tweet.id)}`;
  const media = renderMedia(tweet, preferences);
  const avatar = tweet.author.avatar ? `<img class="avatar${preferences.squareAvatars ? "" : " round"} mini" src="${escapeAttribute(mediaProxyUrl(tweet.author.avatar))}" alt="" loading="lazy">` : "";
  return `<blockquote class="quote quote-big"><a class="quote-link" href="${permalink}" aria-label="View quoted post"></a><div class="tweet-name-row"><div class="fullname-and-username">${avatar}<a class="fullname" href="/${encodeURIComponent(tweet.author.username)}">${escapeHtml(tweet.author.name)}</a>${verifiedBadge(tweet.author.verifiedType)}<a class="username" href="/${encodeURIComponent(tweet.author.username)}">@${escapeHtml(tweet.author.username)}</a></div><span class="tweet-date"><a href="${permalink}" title="${escapeAttribute(formatFullDate(tweet.createdAt))}">${escapeHtml(formatDate(tweet.createdAt))}</a></span></div><div class="quote-text" dir="auto">${linkify(tweet.text, tweet.links, preferences)}</div>${media ? `<div class="quote-media-container">${media}</div>` : ""}${renderCommunityNote(tweet, preferences)}</blockquote>`;
}

function renderCommunityNote(tweet: Tweet, preferences: PagePreferences): string {
  if (!tweet.communityNote || preferences.hideCommunityNotes) return "";
  return `<div class="community-note"><div class="community-note-header"><span class="icon-group"></span><span>Community note</span></div><div class="community-note-text" dir="auto">${linkify(tweet.communityNote, tweet.communityNoteLinks ?? [], preferences)}</div></div>`;
}

function renderStat(label: string, value: number): string {
  return `<li><span class="profile-stat-header">${label}</span><span class="profile-stat-num">${formatNumber(value)}</span></li>`;
}

function verifiedBadge(type: VerifiedType): string {
  if (type === "none") return "";
  const title = type === "business" ? "Verified business account" : type === "government" ? "Verified government account" : "Verified blue account";
  return `<div class="verified-icon ${type}" title="${title}"><div class="icon-container"><span class="icon-circle verified-icon-circle" title="${title}"></span></div><div class="icon-container"><span class="icon-ok verified-icon-check" title="${title}"></span></div></div>`;
}

function formatText(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function linkify(text: string, links: TweetLink[], preferences: PagePreferences = { ...DEFAULT_PREFERENCES }): string {
  if (!links.length) return formatText(text);
  const units = [...text];
  const ordered = [...links]
    .filter((link) => link.end > link.start && link.end <= units.length)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let result = "";
  let cursor = 0;
  for (const link of ordered) {
    if (link.start < cursor) continue;
    const href = replaceUrl(safeHref(link), preferences);
    if (!href) continue;
    const display = link.display || units.slice(link.start, link.end).join("");
    result += formatText(units.slice(cursor, link.start).join(""));
    result += `<a href="${escapeAttribute(href)}" title="${escapeAttribute(link.kind === "url" ? link.url : "")}">${formatText(display)}</a>`;
    cursor = link.end;
  }
  return result + formatText(units.slice(cursor).join(""));
}

function safeHref(link: TweetLink): string {
  if (link.kind === "mention") return `/${encodeURIComponent(link.url.replace(/^\//, ""))}`;
  if ((link.kind === "hashtag" || link.kind === "cashtag") && link.url.startsWith("/search?")) return link.url;
  if (!/^https?:\/\//i.test(link.url)) return "";
  return link.url;
}

export function formatDate(value: string, now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const elapsed = Math.max(0, now.getTime() - date.getTime());
  if (now.getUTCFullYear() !== date.getUTCFullYear()) {
    const month = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date);
    return `${date.getUTCDate()} ${month} ${date.getUTCFullYear()}`;
  }
  if (elapsed >= 86_400_000) {
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  }
  if (elapsed >= 3_600_000) return `${Math.floor(elapsed / 3_600_000)}h`;
  if (elapsed >= 60_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed >= 2_000) return `${Math.floor(elapsed / 1_000)}s`;
  return "now";
}

function formatJoinDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `Joined ${new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(date)}`;
}

function formatJoinDateFull(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const time = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).format(date);
  const day = date.getUTCDate();
  const month = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date);
  return `${time} - ${day} ${month} ${date.getUTCFullYear()}`;
}

function shortLink(value: string): string {
  const stripped = value.replace(/^https?:\/\/(?:www[0-9]?\.)?/i, "");
  return stripped.length > 28 ? `${stripped.slice(0, 28)}…` : stripped;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

export function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const LIBERAPAY_ICON = '<svg class="lp" viewBox="0 0 40.6 52.3" aria-label="Liberapay"><g transform="matrix(0.83,0,0,0.83,-158,-261)"><path d="m202.5,366c-3.1 0-5.5-0.4-7.3-1.2-1.8-0.8-3-1.9-3.8-3.3-0.8-1.4-1.1-3-1.1-4.8 0-1.8 0.3-3.7 0.8-5.8l8.3-34.8 10.2-1.6-9.1 37.8c-0.2 0.8-0.3 1.5-0.3 2.2 0 0.7 0.1 1.2 0.4 1.7 0.3 0.5 0.7 0.9 1.3 1.2 0.6 0.3 1.5 0.5 2.7 0.6l-2 8.1"/><path d="m239.2 344.3c0 3.2-0.5 6.1-1.6 8.8-1 2.6-2.5 4.9-4.4 6.9-1.9 1.9-4.1 3.4-6.7 4.5-2.6 1.1-5.4 1.6-8.5 1.6-1.5 0-3-0.1-4.5-0.4l-3 11.9h-9.7l10.9-45.4c1.7-0.5 3.7-1 6-1.4 2.3-0.4 4.7-0.6 7.3-0.6 2.4 0 4.6 0.4 6.3 1.1 1.8 0.7 3.2 1.8 4.4 3 1.1 1.3 2 2.8 2.5 4.5 0.5 1.7 0.8 3.6 0.8 5.5m-23.8 13.4c0.7 0.2 1.7 0.3 2.8 0.3 1.7 0 3.3-0.3 4.7-1 1.4-0.6 2.6-1.5 3.6-2.7 1-1.1 1.7-2.5 2.3-4.1 0.5-1.6 0.8-3.4 0.8-5.3 0-1.9-0.4-3.5-1.2-4.8-0.8-1.3-2.3-2-4.3-2-1.4 0-2.7 0.1-3.9 0.4l-4.6 19.1"/></g></svg>';
