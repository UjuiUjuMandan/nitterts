import { mediaProxyUrl } from "../media";
import type { Profile } from "../x/profile";
import type { Timeline, Tweet } from "../x/timeline";

export function renderProfilePage(profile: Profile, timeline: Timeline): string {
  const title = `${profile.name} (@${profile.username}) | nitter`;
  const tweets = [timeline.pinned, ...timeline.tweets]
    .filter((tweet): tweet is Tweet => Boolean(tweet))
    .filter((tweet, index, all) => all.findIndex((item) => item.id === tweet.id) === index)
    .map((tweet) => renderTweet(tweet))
    .join("");
  const more = timeline.cursor
    ? `<div class="show-more"><a href="/${encodeURIComponent(profile.username)}?cursor=${encodeURIComponent(timeline.cursor)}">Load more</a></div>`
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
      <aside class="profile-tab sticky">${renderProfileCard(profile)}</aside>
      <section class="timeline-container">
        <ul class="tab">
          <li class="tab-item active"><a href="/${encodeURIComponent(profile.username)}">Tweets</a></li>
          <li class="tab-item wide"><span>Tweets &amp; Replies</span></li>
          <li class="tab-item"><span>Media</span></li>
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
      <div class="profile-card-extra-links">
        <ul class="profile-statlist">
          ${renderStat("Tweets", profile.tweets)}
          ${renderStat("Following", profile.following)}
          ${renderStat("Followers", profile.followers)}
        </ul>
      </div>
    </div>
  </section>`;
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
      <div class="tweet-content media-body" dir="auto">${formatText(tweet.text)}</div>
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
  return `<blockquote class="quote"><div class="tweet-name-row"><div class="fullname-and-username"><strong class="fullname">${escapeHtml(tweet.author.name)}</strong><span class="username">@${escapeHtml(tweet.author.username)}</span></div></div><div class="quote-text" dir="auto">${formatText(tweet.text)}</div></blockquote>`;
}

function renderStat(label: string, value: number): string {
  return `<li><span class="profile-stat-header">${label}</span><span class="profile-stat-num">${formatNumber(value)}</span></li>`;
}

function formatText(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date).replaceAll(",", "");
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
