import { mediaProxyUrl } from "../media";
import type { Profile } from "../x/profile";
import type { PhotoRailItem, ProfileTab, Timeline, Tweet, TweetLink } from "../x/timeline";

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
): string {
  const title = `${profile.name} (@${profile.username}) | nitter`;
  const base = `/${encodeURIComponent(profile.username)}`;
  const tweets = [timeline.pinned, ...timeline.tweets]
    .filter((tweet): tweet is Tweet => Boolean(tweet))
    .filter((tweet, index, all) => all.findIndex((item) => item.id === tweet.id) === index)
    .map((tweet) => renderTweet(tweet))
    .join("");
  const more = timeline.cursor
    ? `<div class="show-more"><a href="${base}${TAB_PATHS[tab]}?cursor=${encodeURIComponent(timeline.cursor)}">Load more</a></div>`
    : "";
  const timelineBody = profile.suspended
    ? '<div class="timeline-header timeline-message"><h2>This account is suspended.</h2></div>'
    : profile.protected
      ? `<div class="timeline-header timeline-message"><h2>This account's tweets are protected.</h2><p>Only confirmed followers have access to @${escapeHtml(profile.username)}'s tweets.</p></div>`
      : tweets || '<div class="timeline-header timeline-message"><h2>No tweets found.</h2></div>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeAttribute(profile.bio || `Posts by @${profile.username}`)}">
  <meta name="theme-color" content="#1f1f1f">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  ${renderNavbar()}
  <div class="container">
    <main class="profile-tabs">
      ${profile.banner ? `<div class="profile-banner"><a href="${escapeAttribute(mediaProxyUrl(profile.banner))}" target="_blank" rel="noopener" aria-label="Open banner image"><img src="${escapeAttribute(mediaProxyUrl(profile.banner))}" alt=""></a></div>` : ""}
      <aside class="profile-tab sticky">${renderProfileCard(profile)}${renderPhotoRail(profile, photos)}</aside>
      <section class="timeline-container">
        <ul class="tab">
          <li class="tab-item${tab === "tweets" ? " active" : ""}"><a href="${base}">Tweets</a></li>
          <li class="tab-item wide${tab === "replies" ? " active" : ""}"><a href="${base}/with_replies">Tweets &amp; Replies</a></li>
          <li class="tab-item${tab === "media" ? " active" : ""}"><a href="${base}/media">Media</a></li>
        </ul>
        <div class="timeline">${timelineBody}</div>
        ${profile.protected || profile.suspended ? "" : more}
      </section>
    </main>
  </div>
</body>
</html>`;
}

export function renderErrorPage(message: string, status: number): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${status} | nitter</title><link rel="stylesheet" href="/style.css"></head><body>${renderNavbar()}<div class="container"><main class="panel-container"><section class="error-panel"><h1>${status}</h1><p>${escapeHtml(message)}</p></section></main></div></body></html>`;
}

export function renderNavbar(): string {
  return `<nav><div class="inner-nav"><div class="nav-item"><a class="site-name" href="/">nitter</a></div><a href="/"><img class="site-logo" src="/logo.png" alt="Logo"></a><div class="nav-item right"></div></div></nav>`;
}

function renderProfileCard(profile: Profile): string {
  const avatar = profile.avatar
    ? `<a class="profile-card-avatar" href="${escapeAttribute(mediaProxyUrl(profile.avatar))}" target="_blank" rel="noopener" aria-label="Open ${escapeAttribute(profile.name)}'s profile image"><img src="${escapeAttribute(mediaProxyUrl(profile.avatar))}" alt=""></a>`
    : "";

  return `<section class="profile-card">
    <div class="profile-card-info">
      ${avatar}
      <div class="profile-card-tabs-name">
        <a class="profile-card-fullname" href="/${encodeURIComponent(profile.username)}">${escapeHtml(profile.name)}</a>${profile.blueVerified ? '<span class="verified" title="Verified">&#10003;</span>' : ""}
        <a class="profile-card-username" href="/${encodeURIComponent(profile.username)}">@${escapeHtml(profile.username)}</a>
      </div>
    </div>
    <div class="profile-card-extra">
      ${profile.bio ? `<div class="profile-bio"><p dir="auto">${formatText(profile.bio)}</p></div>` : ""}
      ${profile.location ? `<div class="profile-location"><span>${escapeHtml(profile.location)}</span></div>` : ""}
      ${profile.website && /^https?:\/\//i.test(profile.website) ? `<div class="profile-website"><a href="${escapeAttribute(profile.website)}" target="_blank" rel="noopener">${escapeHtml(shortLink(profile.website))}</a></div>` : profile.website ? `<div class="profile-website"><span>${escapeHtml(shortLink(profile.website))}</span></div>` : ""}
      ${profile.joinedAt ? `<div class="profile-joindate" title="${escapeAttribute(profile.joinedAt)}"><span>${escapeHtml(formatJoinDate(profile.joinedAt))}</span></div>` : ""}
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
    <div class="photo-rail-header"><a href="${base}/media">${formatNumber(profile.media || photos.length)} Photos and videos</a></div>
    <input id="photo-rail-grid-toggle" type="checkbox">
    <label class="photo-rail-header-mobile" for="photo-rail-grid-toggle">${formatNumber(profile.media || photos.length)} Photos and videos</label>
    <div class="photo-rail-grid">${grid}</div>
  </section>`;
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

export function renderTweet(source: Tweet, main = false): string {
  const tweet = source.retweet ?? source;
  const context = source.retweet
    ? `<div class="retweet-header"><span>${escapeHtml(source.author.name)} retweeted</span></div>`
    : source.pinned
      ? '<div class="pinned"><span>Pinned Tweet</span></div>'
      : "";
  const media = renderMedia(tweet);
  const quote = tweet.quote ? renderQuote(tweet.quote) : "";

  const permalink = `/${encodeURIComponent(tweet.author.username)}/status/${encodeURIComponent(tweet.id)}`;
  return `<article class="timeline-item tweet${main ? " main-tweet-item" : ""}">
    ${main ? "" : `<a class="tweet-link" href="${permalink}" aria-label="View post"></a>`}
    <div class="tweet-body">
      ${context}
      <div class="tweet-header">
        ${tweet.author.avatar ? `<a class="tweet-avatar" href="/${encodeURIComponent(tweet.author.username)}" aria-label="View @${escapeAttribute(tweet.author.username)} profile"><img class="avatar round" src="${escapeAttribute(mediaProxyUrl(tweet.author.avatar))}" alt=""></a>` : ""}
        <div class="tweet-name-row">
          <div class="fullname-and-username"><a class="fullname" href="/${encodeURIComponent(tweet.author.username)}">${escapeHtml(tweet.author.name)}</a>${tweet.author.blueVerified ? '<span class="verified" title="Verified">&#10003;</span>' : ""}<a class="username" href="/${encodeURIComponent(tweet.author.username)}">@${escapeHtml(tweet.author.username)}</a></div>
          <span class="tweet-date"><a href="${permalink}">${escapeHtml(formatDate(tweet.createdAt))}</a></span>
        </div>
      </div>
      ${tweet.replyTo.length ? `<div class="replying-to">Replying to ${tweet.replyTo.map((name) => `@${escapeHtml(name)}`).join(" ")}</div>` : ""}
      <div class="tweet-content media-body" dir="auto">${linkify(tweet.text, tweet.links)}</div>
      ${media}
      ${quote}
      <div class="tweet-stats"><span class="tweet-stat">reply ${formatNumber(tweet.replies)}</span><span class="tweet-stat">retweet ${formatNumber(tweet.retweets)}</span><span class="tweet-stat">like ${formatNumber(tweet.likes)}</span>${tweet.views ? `<span class="tweet-stat">view ${formatNumber(tweet.views)}</span>` : ""}</div>
    </div>
  </article>`;
}

function renderMedia(tweet: Tweet): string {
  if (!tweet.media.length) return "";
  const items = tweet.media
    .map((item) => {
      const image = item.kind === "photo" ? item.url : item.preview;
      if (!image) return "";
      const badge = item.kind === "photo" ? "" : `<span class="media-badge">${item.kind === "gif" ? "GIF" : "VIDEO"}</span>`;
      return `<a class="attachment still-image" href="${escapeAttribute(mediaProxyUrl(item.url || image))}" target="_blank" rel="noopener"><img loading="lazy" src="${escapeAttribute(mediaProxyUrl(image))}" alt="${escapeAttribute(item.alt)}">${badge}</a>`;
    })
    .filter(Boolean)
    .join("");
  return items ? `<div class="attachments count-${Math.min(tweet.media.length, 4)}">${items}</div>` : "";
}

function renderQuote(tweet: Tweet): string {
  const permalink = `/${encodeURIComponent(tweet.author.username)}/status/${encodeURIComponent(tweet.id)}`;
  const media = renderMedia(tweet);
  return `<blockquote class="quote"><a class="quote-link" href="${permalink}" aria-label="View quoted post"></a><div class="tweet-name-row"><div class="fullname-and-username"><strong class="fullname">${escapeHtml(tweet.author.name)}</strong><span class="username">@${escapeHtml(tweet.author.username)}</span></div></div><div class="quote-text" dir="auto">${linkify(tweet.text, tweet.links)}</div>${media ? `<div class="quote-media-container">${media}</div>` : ""}</blockquote>`;
}

function renderStat(label: string, value: number): string {
  return `<li><span class="profile-stat-header">${label}</span><span class="profile-stat-num">${formatNumber(value)}</span></li>`;
}

function formatText(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function linkify(text: string, links: TweetLink[]): string {
  if (!links.length) return formatText(text);
  const units = [...text];
  const ordered = [...links]
    .filter((link) => link.end > link.start && link.end <= units.length)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let result = "";
  let cursor = 0;
  for (const link of ordered) {
    if (link.start < cursor) continue;
    const href = safeHref(link);
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
  if (!/^https?:\/\//i.test(link.url)) return "";
  return link.url;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date).replaceAll(",", "");
}

function formatJoinDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(date);
}

function shortLink(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
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
