import type { Conversation, ConversationThread, ReplySort } from "../x/conversation";
import { bodyClass, DEFAULT_PREFERENCES, type PagePreferences } from "../preferences";
import { escapeAttribute, escapeHtml, headScripts, renderNavbar, renderTweet, themeLink } from "./profile";

export function renderStatusPage(conversation: Conversation, preferences: PagePreferences = { ...DEFAULT_PREFERENCES }, currentCursor?: string, sort: ReplySort = "Relevance"): string {
  const { tweet } = conversation;
  const description = tweet.text || `Post by @${tweet.author.username}`;
  const titleText = `${tweet.author.name}: "${truncate(tweet.text, 72)}"`;
  const permalink = `/${encodeURIComponent(tweet.author.username)}/status/${encodeURIComponent(tweet.id)}`;
  const sortQuery = sort === "Relevance" ? "" : `sort=${sort}&amp;`;
  const newest = `${permalink}${sort === "Relevance" ? "" : `?sort=${sort}`}#r`;
  const sortOptions = ([ ["Relevance", "Relevant"], ["Recency", "Recent"], ["Likes", "Liked"] ] as const)
    .map(([mode, label]) => `<a class="reply-sort-option${sort === mode ? " active" : ""}" href="?sort=${mode}#r">${label}</a>`)
    .join("");
  const before = conversation.before.map((item) => renderTweet(item, false, preferences)).join("");
  const after = conversation.after.map((item, index, items) => renderTweet(item, false, preferences, index === items.length - 1)).join("");
  const replies = conversation.replies
    .map((thread) => `<div class="reply thread thread-line">${renderThread(thread, preferences)}</div>`)
    .join("");
  const more = conversation.cursor
    ? `<div class="show-more"><a href="${permalink}?${sortQuery}cursor=${encodeURIComponent(conversation.cursor)}#r">Load more</a></div>`
    : "";
  const related = conversation.related.length && !preferences.hideRelated
    ? `<div class="related-tweets"><div class="related-header">Related tweets</div>${conversation.related.map((thread) => `<section class="reply thread-line">${renderThread(thread, preferences)}</section>`).join("")}</div>`
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
  ${renderNavbar("", `${permalink}#m`, `https://x.com${permalink}`)}
  <div class="container">
    <main class="conversation">
      <section class="main-thread">
        ${before ? `<div class="before-tweet thread-line">${before}</div>` : ""}
        <div class="main-tweet${after ? " thread-line" : ""}" id="m">${renderTweet(tweet, true, preferences)}</div>
        ${after ? `<div class="after-tweet thread-line">${after}</div>` : ""}
      </section>
      ${currentCursor && !preferences.hideReplies ? `<div class="timeline-item show-more"><a href="${newest}">Load newest</a></div>` : ""}
      ${(replies || more || currentCursor) && !preferences.hideReplies ? `<div class="reply-sort"><span class="reply-sort-label">Sort replies:</span>${sortOptions}</div><div class="replies" id="r">${replies}${more}</div>` : ""}
      ${related}
      <div class="top-ref"><div class="icon-container"><a class="icon-down" href="#m" title="Back to top"></a></div></div>
    </main>
  </div>
</body>
</html>`;
}

function renderThread(thread: ConversationThread, preferences: PagePreferences): string {
  const tweets = thread.tweets.map((item, index) => renderTweet(item, false, preferences, index === thread.tweets.length - 1 && !thread.hasMore)).join("");
  const last = thread.tweets.at(-1);
  const more = thread.hasMore && last
    ? `<div class="timeline-item more-replies"><a class="more-replies-text" href="/${encodeURIComponent(last.author.username)}/status/${encodeURIComponent(last.id)}#m">more replies</a></div>`
    : "";
  return tweets + more;
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}...` : value;
}
