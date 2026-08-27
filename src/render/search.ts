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
  since?: string;
  until?: string;
  minLikes?: string;
};

export function renderSearchPage(
  search: SearchPage,
  timeline?: Timeline,
  profile?: Profile,
  photos: PhotoRailItem[] = [],
): string {
  const title = search.query ? `Search (${search.query}) | nitter` : "Search | nitter";
  const hasTerms = Boolean(search.query || search.username || search.since || search.until || search.minLikes);
  const base = search.username ? `/${encodeURIComponent(search.username)}/search` : "/search";
  const items = timeline?.tweets.map((tweet) => renderTweet(tweet)).join("") ?? "";
  const body = profile?.suspended
    ? '<div class="timeline-header timeline-message"><h2>This account is suspended.</h2></div>'
    : profile?.protected
      ? `<div class="timeline-header timeline-message"><h2>This account's tweets are protected.</h2><p>Only confirmed followers have access to @${escapeHtml(profile.username)}'s tweets.</p></div>`
      : !hasTerms
        ? '<div class="timeline-header timeline-message"><h2>No items found</h2></div>'
        : items || '<div class="timeline-header timeline-message"><h2>No results found.</h2></div>';
  const more = timeline?.cursor
    ? `<div class="show-more"><a href="${escapeAttribute(searchUrl(base, search, timeline.cursor))}">Load more</a></div>`
    : "";
  const contentBody = `
    ${profile ? renderProfileTabs(profile.username) : ""}
    <div class="timeline-header">${renderSearchForm(base, search)}</div>
    ${search.username ? "" : renderSearchTabs(search)}
    <div class="timeline">${body}</div>
    ${more}`;
  const content = `<section class="timeline-container search-results">${contentBody}</section>`;
  const main = profile
    ? `<main class="profile-tabs">
        ${profile.banner ? `<div class="profile-banner"><a href="${escapeAttribute(mediaProxyUrl(profile.banner))}" target="_blank" rel="noopener"><img src="${escapeAttribute(mediaProxyUrl(profile.banner))}" alt=""></a></div>` : ""}
        <aside class="profile-tab sticky">${renderProfileCard(profile)}${renderPhotoRail(profile, photos)}</aside>
        ${content}
      </main>`
    : `<main class="timeline-container search-results search-page">${contentBody}</main>`;

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
  const panelOpen = Boolean(search.since || search.until || search.minLikes);
  return `<form method="get" action="${escapeAttribute(action)}" class="search-field" autocomplete="off">
    <input type="hidden" name="f" value="${search.kind}">
    <input type="text" name="q" value="${escapeAttribute(search.query)}" placeholder="Enter search..." maxlength="500" dir="auto">
    <button type="submit" aria-label="Search"><span class="icon-search"></span></button>
    <input id="search-panel-toggle" type="checkbox"${panelOpen ? " checked" : ""}>
    <label for="search-panel-toggle" title="Advanced search"><span class="icon-down"></span></label>
    <div class="search-panel">
      <label><span>Since</span><input type="date" name="since" value="${escapeAttribute(search.since ?? "")}"></label>
      <label><span>Until</span><input type="date" name="until" value="${escapeAttribute(search.until ?? "")}"></label>
      <label><span>Minimum likes</span><input type="number" name="min_faves" min="0" value="${escapeAttribute(search.minLikes ?? "")}"></label>
    </div>
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
  const params = searchParams(search);
  params.set("f", kind);
  const href = `/search?${params}`;
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
  const params = searchParams(search);
  params.set("cursor", cursor);
  return `${base}?${params}`;
}

function searchParams(search: SearchPage): URLSearchParams {
  const params = new URLSearchParams({ f: search.kind, q: search.query });
  if (search.since) params.set("since", search.since);
  if (search.until) params.set("until", search.until);
  if (search.minLikes) params.set("min_faves", search.minLikes);
  return params;
}
