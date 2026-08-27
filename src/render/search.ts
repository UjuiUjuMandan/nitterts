import { mediaProxyUrl } from "../media";
import type { Profile } from "../x/profile";
import type { PhotoRailItem, SearchKind, Timeline } from "../x/timeline";
import {
  escapeAttribute,
  escapeHtml,
  renderNavbar,
  renderPhotoRail,
  renderProfileCard,
  renderTweet,
} from "./profile";

export type SearchPage = {
  query: string;
  kind: SearchKind;
  cursor?: string;
  username?: string;
};

export function renderSearchPage(
  search: SearchPage,
  timeline?: Timeline,
  profile?: Profile,
  photos: PhotoRailItem[] = [],
): string {
  const title = search.query ? `Search (${search.query}) | nitter` : "Search | nitter";
  const base = search.username ? `/${encodeURIComponent(search.username)}/search` : "/search";
  const items = timeline?.tweets.map((tweet) => renderTweet(tweet)).join("") ?? "";
  const body = profile?.suspended
    ? '<div class="timeline-header timeline-message"><h2>This account is suspended.</h2></div>'
    : profile?.protected
      ? `<div class="timeline-header timeline-message"><h2>This account's tweets are protected.</h2><p>Only confirmed followers have access to @${escapeHtml(profile.username)}'s tweets.</p></div>`
      : !search.query && !search.username
        ? '<div class="timeline-header timeline-message"><h2>Enter a search term.</h2></div>'
        : items || '<div class="timeline-header timeline-message"><h2>No results found.</h2></div>';
  const more = timeline?.cursor
    ? `<div class="show-more"><a href="${escapeAttribute(searchUrl(base, search, timeline.cursor))}">Load more</a></div>`
    : "";
  const content = `<section class="timeline-container search-results">
    ${profile ? renderProfileTabs(profile.username) : ""}
    <div class="timeline-header">${renderSearchForm(base, search)}</div>
    ${search.username ? "" : renderSearchTabs(search)}
    <div class="timeline">${body}</div>
    ${more}
  </section>`;
  const main = profile
    ? `<main class="profile-tabs">
        ${profile.banner ? `<div class="profile-banner"><a href="${escapeAttribute(mediaProxyUrl(profile.banner))}" target="_blank" rel="noopener"><img src="${escapeAttribute(mediaProxyUrl(profile.banner))}" alt=""></a></div>` : ""}
        <aside class="profile-tab sticky">${renderProfileCard(profile)}${renderPhotoRail(profile, photos)}</aside>
        ${content}
      </main>`
    : `<main class="panel-container search-page">${content}</main>`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#1f1f1f">
  <title>${escapeHtml(title)}</title>
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/css/fontello.css">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  ${renderNavbar()}
  <div class="container">${main}</div>
</body>
</html>`;
}

function renderSearchForm(action: string, search: SearchPage): string {
  return `<form method="get" action="${escapeAttribute(action)}" class="search-field" autocomplete="off">
    <input type="hidden" name="f" value="${search.kind}">
    <input type="text" name="q" value="${escapeAttribute(search.query)}" placeholder="Enter search..." maxlength="500" dir="auto">
    <button type="submit" aria-label="Search"><span class="icon-search"></span></button>
  </form>`;
}

function renderSearchTabs(search: SearchPage): string {
  return `<ul class="tab search-tabs">
    ${searchTab("Top", "top", search)}
    ${searchTab("Latest", "tweets", search)}
    ${searchTab("Media", "media", search)}
  </ul>`;
}

function searchTab(label: string, kind: SearchKind, search: SearchPage): string {
  const href = `/search?f=${kind}&q=${encodeURIComponent(search.query)}`;
  return `<li class="tab-item${search.kind === kind ? " active" : ""}"><a href="${escapeAttribute(href)}">${label}</a></li>`;
}

function renderProfileTabs(username: string): string {
  const base = `/${encodeURIComponent(username)}`;
  return `<ul class="tab">
    <li class="tab-item"><a href="${base}">Tweets</a></li>
    <li class="tab-item wide"><a href="${base}/with_replies">Tweets &amp; Replies</a></li>
    <li class="tab-item"><a href="${base}/media">Media</a></li>
    <li class="tab-item active"><a href="${base}/search">Search</a></li>
  </ul>`;
}

function searchUrl(base: string, search: SearchPage, cursor: string): string {
  const params = new URLSearchParams({ f: search.kind, q: search.query, cursor });
  return `${base}?${params}`;
}
