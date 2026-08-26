import { mediaProxyUrl } from "../media";
import type { Profile } from "../x/profile";
import type { Timeline, Tweet } from "../x/timeline";

export function renderProfilePage(profile: Profile, timeline: Timeline): string {
  const title = `${profile.name} (@${profile.username}) | Nitter`;
  const tweets = [timeline.pinned, ...timeline.tweets]
    .filter((tweet): tweet is Tweet => Boolean(tweet))
    .filter((tweet, index, all) => all.findIndex((item) => item.id === tweet.id) === index)
    .map(renderTweet)
    .join("");
  const more = timeline.cursor
    ? `<a class="show-more" href="/${encodeURIComponent(profile.username)}?cursor=${encodeURIComponent(timeline.cursor)}">Load more</a>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeAttribute(profile.bio || `Posts by @${profile.username}`)}">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <nav><a class="brand" href="/"><img src="/logo.png" alt="">nitter</a></nav>
  <main class="profile-layout">
    <aside class="profile-card">
      ${profile.avatar ? `<img class="profile-avatar" src="${escapeAttribute(mediaProxyUrl(profile.avatar))}" alt="">` : ""}
      <h1>${escapeHtml(profile.name)}${profile.blueVerified ? '<span class="verified">✓</span>' : ""}</h1>
      <a class="username" href="/${encodeURIComponent(profile.username)}">@${escapeHtml(profile.username)}</a>
      ${profile.bio ? `<p class="bio">${formatText(profile.bio)}</p>` : ""}
      <dl class="profile-stats">
        ${renderStat("Tweets", profile.tweets)}
        ${renderStat("Following", profile.following)}
        ${renderStat("Followers", profile.followers)}
      </dl>
    </aside>
    <section class="timeline">
      <header class="timeline-tabs"><strong>Tweets</strong><span>Tweets & Replies</span><span>Media</span></header>
       ${profile.suspended ? '<div class="notice">This account is suspended.</div>' : profile.protected ? `<div class="notice">This account's tweets are protected.</div>` : tweets || '<div class="notice">No tweets found.</div>'}
      ${more}
    </section>
  </main>
</body>
</html>`;
}

export function renderErrorPage(message: string, status: number): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${status} | Nitter</title><link rel="stylesheet" href="/style.css"></head><body><nav><a class="brand" href="/">nitter</a></nav><main class="error-card"><h1>${status}</h1><p>${escapeHtml(message)}</p></main></body></html>`;
}

function renderTweet(source: Tweet): string {
  const tweet = source.retweet ?? source;
  const repost = source.retweet
    ? `<div class="tweet-context">${escapeHtml(source.author.name)} reposted</div>`
    : source.pinned
      ? '<div class="tweet-context">Pinned post</div>'
      : "";
  const media = tweet.media
    .map((item) => {
      const image = item.kind === "photo" ? item.url : item.preview;
      if (!image) return "";
      return `<a class="media" href="${escapeAttribute(mediaProxyUrl(item.url || image))}"><img loading="lazy" src="${escapeAttribute(mediaProxyUrl(image))}" alt="${escapeAttribute(item.alt)}"></a>`;
    })
    .join("");
  const quote = tweet.quote ? `<blockquote>${renderTweetCompact(tweet.quote)}</blockquote>` : "";

  return `<article class="tweet">
    ${repost}
    <div class="tweet-header">
      ${tweet.author.avatar ? `<img src="${escapeAttribute(mediaProxyUrl(tweet.author.avatar))}" alt="">` : ""}
      <div><a href="/${encodeURIComponent(tweet.author.username)}"><strong>${escapeHtml(tweet.author.name)}</strong></a><span>@${escapeHtml(tweet.author.username)}</span></div>
      <span class="tweet-date">${escapeHtml(formatDate(tweet.createdAt))}</span>
    </div>
    ${tweet.replyTo.length ? `<div class="replying">Replying to ${tweet.replyTo.map((name) => `@${escapeHtml(name)}`).join(" ")}</div>` : ""}
    <div class="tweet-content">${formatText(tweet.text)}</div>
    ${media ? `<div class="media-grid">${media}</div>` : ""}
    ${quote}
    <div class="tweet-stats"><span>↩ ${formatNumber(tweet.replies)}</span><span>↻ ${formatNumber(tweet.retweets)}</span><span>♥ ${formatNumber(tweet.likes)}</span>${tweet.views ? `<span>◉ ${formatNumber(tweet.views)}</span>` : ""}</div>
  </article>`;
}

function renderTweetCompact(tweet: Tweet): string {
  return `<strong>${escapeHtml(tweet.author.name)}</strong> <span>@${escapeHtml(tweet.author.username)}</span><p>${formatText(tweet.text)}</p>`;
}

function renderStat(label: string, value: number): string {
  return `<div><dt>${label}</dt><dd>${formatNumber(value)}</dd></div>`;
}

function formatText(value: string): string {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en").format(value);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value);
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
