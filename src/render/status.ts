import type { Conversation } from "../x/conversation";
import { bodyClass, DEFAULT_PREFERENCES, type PagePreferences } from "../preferences";
import { escapeAttribute, escapeHtml, renderNavbar, renderTweet } from "./profile";

export function renderStatusPage(conversation: Conversation, preferences: PagePreferences = { ...DEFAULT_PREFERENCES }): string {
  const { tweet } = conversation;
  const description = tweet.text || `Post by @${tweet.author.username}`;
  const titleText = `${tweet.author.name}: "${truncate(tweet.text, 72)}"`;
  const permalink = `/${encodeURIComponent(tweet.author.username)}/status/${encodeURIComponent(tweet.id)}`;
  const before = conversation.before.map((item) => renderTweet(item, false, preferences)).join("");
  const after = conversation.after.map((item, index, items) => renderTweet(item, false, preferences, index === items.length - 1)).join("");
  const replies = conversation.replies
    .map((thread) => `<section class="reply thread-line">${thread.map((item, index) => renderTweet(item, false, preferences, index === thread.length - 1)).join("")}</section>`)
    .join("");

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
  <link rel="stylesheet" href="/css/style.css">
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
      ${replies && !preferences.hideReplies ? `<div class="reply-sort"><span class="reply-sort-label">Replies</span><strong>Relevant</strong></div><section class="replies" id="r">${replies}</section>` : ""}
      <div class="top-ref"><div class="icon-container"><a class="icon-down" href="#m" title="Back to top"></a></div></div>
    </main>
  </div>
</body>
</html>`;
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}...` : value;
}
