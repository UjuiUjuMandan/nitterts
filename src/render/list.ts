import { mediaProxyUrl } from "../media";
import { bodyClass, DEFAULT_PREFERENCES, type PagePreferences } from "../preferences";
import type { ListDetail, ListMembers } from "../x/list";
import type { Timeline } from "../x/timeline";
import { escapeAttribute, escapeHtml, renderNavbar, renderTweet, renderUserResult } from "./profile";

export function renderListPage(
  list: ListDetail,
  tab: "tweets" | "members",
  timeline?: Timeline,
  members?: ListMembers,
  preferences: PagePreferences = { ...DEFAULT_PREFERENCES },
  currentCursor?: string,
): string {
  const base = `/i/lists/${encodeURIComponent(list.id)}`;
  const items = tab === "members"
    ? members?.users.map((user) => renderUserResult(user, preferences)).join("") ?? ""
    : timeline?.tweets.map((tweet) => renderTweet(tweet, false, preferences)).join("") ?? "";
  const cursor = tab === "members" ? members?.cursor : timeline?.cursor;
  const more = cursor
    ? `<div class="show-more"><a href="${base}${tab === "members" ? "/members" : ""}?cursor=${encodeURIComponent(cursor)}">Load more</a></div>`
    : "";
  const empty = `<div class="timeline-header timeline-message"><h2>No ${tab === "members" ? "members" : "tweets"} found.</h2></div>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${escapeAttribute(list.description || `${list.name} by @${list.owner.username}`)}">
  <meta name="theme-color" content="#1f1f1f">
  <title>${escapeHtml(list.name)} | nitter</title>
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/css/fontello.css">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="alternate" type="application/rss+xml" href="${base}/rss" title="RSS feed">
</head>
<body${bodyClass(preferences)}>
  ${renderNavbar(base, `${base}${tab === "members" ? "/members" : ""}${currentCursor ? `?cursor=${encodeURIComponent(currentCursor)}` : ""}`)}
  <div class="container">
    <main class="timeline-container list-page">
      ${list.banner && !preferences.hideBanner ? `<div class="timeline-banner"><a href="${escapeAttribute(mediaProxyUrl(list.banner))}" target="_blank" rel="noopener"><img src="${escapeAttribute(mediaProxyUrl(list.banner))}" alt=""></a></div>` : ""}
      <div class="timeline-header list-header">&quot;${escapeHtml(list.name)}&quot; by <a href="/${encodeURIComponent(list.owner.username)}">@${escapeHtml(list.owner.username)}</a>${list.description ? `<div class="timeline-description">${escapeHtml(list.description)}</div>` : ""}</div>
      <ul class="tab">
        <li class="tab-item${tab === "tweets" ? " active" : ""}"><a href="${base}">Tweets</a></li>
        <li class="tab-item${tab === "members" ? " active" : ""}"><a href="${base}/members">Members</a></li>
      </ul>
      <div class="timeline">${items || empty}</div>
      ${more}
    </main>
  </div>
</body>
</html>`;
}
