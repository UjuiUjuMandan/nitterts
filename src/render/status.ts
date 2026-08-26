import type { Conversation } from "../x/conversation";
import { escapeAttribute, escapeHtml, renderNavbar, renderTweet } from "./profile";

export function renderStatusPage(conversation: Conversation): string {
  const { tweet } = conversation;
  const description = tweet.text || `Post by @${tweet.author.username}`;
  const titleText = `${tweet.author.name}: "${truncate(tweet.text, 72)}"`;
  const before = conversation.before.map((item) => renderTweet(item)).join("");
  const after = conversation.after.map((item) => renderTweet(item)).join("");
  const replies = conversation.replies
    .map((thread) => `<section class="reply thread-line">${thread.map((item) => renderTweet(item)).join("")}</section>`)
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
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  ${renderNavbar()}
  <div class="container">
    <main class="conversation">
      <section class="main-thread">
        ${before ? `<div class="before-tweet thread-line">${before}</div>` : ""}
        <div class="main-tweet${after ? " thread-line" : ""}" id="m">${renderTweet(tweet, true)}</div>
        ${after ? `<div class="after-tweet thread-line">${after}</div>` : ""}
      </section>
      ${replies ? `<div class="reply-sort"><span class="reply-sort-label">Replies</span><strong>Relevant</strong></div><section class="replies" id="r">${replies}</section>` : ""}
    </main>
  </div>
</body>
</html>`;
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}...` : value;
}
