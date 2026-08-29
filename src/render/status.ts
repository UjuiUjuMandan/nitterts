import type { Conversation } from "../x/conversation";
import { bodyClass, DEFAULT_PREFERENCES, type PagePreferences } from "../preferences";
import { escapeAttribute, escapeHtml, headScripts, renderNavbar, renderTweet, themeLink } from "./profile";

export function renderStatusPage(conversation: Conversation, preferences: PagePreferences = { ...DEFAULT_PREFERENCES }): string {
  const { tweet } = conversation;
  const description = tweet.text || `Post by @${tweet.author.username}`;
  const titleText = `${tweet.author.name}: "${truncate(tweet.text, 72)}"`;
  const permalink = `/${encodeURIComponent(tweet.author.username)}/status/${encodeURIComponent(tweet.id)}`;
  const before = conversation.before.map((item) => renderTweet(item, false, preferences)).join("");
  const after = conversation.after.map((item, index, items) => renderTweet(item, false, preferences, index === items.length - 1)).join("");
  const replies = conversation.replies
    .map((thread) => `<div class="reply thread thread-line">${thread.map((item, index) => renderTweet(item, false, preferences, index === thread.length - 1)).join("")}</div>`)
    .join("");
  const more = conversation.cursor
    ? `<div class="show-more"><a href="${permalink}?cursor=${encodeURIComponent(conversation.cursor)}#r">Load more</a></div>`
    : "";
  const related = conversation.related.length && !preferences.hideRelated
    ? `<div class="related-tweets"><div class="related-header">Related tweets</div>${conversation.related.map((thread) => `<section class="reply thread-line">${thread.map((item, index) => renderTweet(item, false, preferences, index === thread.length - 1)).join("")}</section>`).join("")}</div>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeAttribute(description)}">
  <meta name="theme-color" content="#1f1f1f">
  <title>${escapeHtml(titleText)} | nitter</title>
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/css/fontello.css">
  <link rel="stylesheet" href="/css/style.css">${themeLink(preferences)}${headScripts(preferences)}
</head>
<body${bodyClass(preferences)}>
  ${renderNavbar("", permalink)}
  <div class="container">
    <main class="conversation">
      <section class="main-thread">
        ${before ? `<div class="before-tweet thread-line">${before}</div>` : ""}
        <div class="main-tweet${after ? " thread-line" : ""}" id="m">${renderTweet(tweet, true, preferences)}</div>
        ${after ? `<div class="after-tweet thread-line">${after}</div>` : ""}
      </section>
      ${(replies || more) && !preferences.hideReplies ? `<div class="reply-sort"><span class="reply-sort-label">Replies</span><strong>Relevant</strong></div><div class="replies" id="r">${replies}${more}</div>` : ""}
      ${related}
      <div class="top-ref"><div class="icon-container"><a class="icon-down" href="#m" title="Back to top"></a></div></div>
    </main>
  </div>
</body>
</html>`;
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}...` : value;
}
