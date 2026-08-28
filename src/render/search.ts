import { mediaProxyUrl } from "../media";
import { bodyClass, DEFAULT_PREFERENCES, type PagePreferences } from "../preferences";
import type { Profile } from "../x/profile";
import type { PhotoRailItem, SearchKind, SearchList, SearchResults } from "../x/timeline";
import {
  escapeAttribute,
  escapeHtml,
  renderNavbar,
  renderPhotoRail,
  renderProfileCard,
  renderTweet,
  renderUserResult,
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
  results?: SearchResults,
  profile?: Profile,
  photos: PhotoRailItem[] = [],
  preferences: PagePreferences = { ...DEFAULT_PREFERENCES },
): string {
  const title = search.query ? `Search (${search.query}) | nitter` : "Search | nitter";
  const hasTerms = Boolean(search.query || search.username || search.since || search.until || search.minLikes);
  const base = search.username ? `/${encodeURIComponent(search.username)}/search` : "/search";
  const timeline = results?.timeline;
  const items = search.kind === "users"
    ? results?.users?.map((user) => renderUserResult(user, preferences)).join("") ?? ""
    : search.kind === "lists"
      ? results?.lists?.map(renderListResult).join("") ?? ""
      : timeline?.tweets.map((tweet) => renderTweet(tweet, false, preferences)).join("") ?? "";
  const body = profile?.suspended
    ? '<div class="timeline-header timeline-message"><h2>This account is suspended.</h2></div>'
    : profile?.protected
      ? `<div class="timeline-header timeline-message"><h2>This account's tweets are protected.</h2><p>Only confirmed followers have access to @${escapeHtml(profile.username)}'s tweets.</p></div>`
      : !hasTerms
        ? '<div class="timeline-header timeline-message"><h2>No items found</h2></div>'
        : items || '<div class="timeline-header timeline-message"><h2>No results found.</h2></div>';
  const cursor = results?.cursor ?? timeline?.cursor;
  const currentPath = search.cursor ? searchUrl(base, search, search.cursor) : `${base}?${searchParams(search)}`;
  const more = cursor
    ? `<div class="show-more"><a href="${escapeAttribute(searchUrl(base, search, cursor))}">Load more</a></div>`
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
        ${profile.banner && !preferences.hideBanner ? `<div class="profile-banner"><a href="${escapeAttribute(mediaProxyUrl(profile.banner))}" target="_blank" rel="noopener"><img src="${escapeAttribute(mediaProxyUrl(profile.banner))}" alt=""></a></div>` : ""}
        <aside class="profile-tab${preferences.stickyProfile ? " sticky" : ""}">${renderProfileCard(profile)}${renderPhotoRail(profile, photos)}</aside>
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
<body${bodyClass(preferences)}>
  ${renderNavbar("", currentPath)}
  <div class="container">${main}</div>
</body>
</html>`;
}

function renderSearchForm(action: string, search: SearchPage): string {
  const directorySearch = search.kind === "users" || search.kind === "lists";
  const panelOpen = !directorySearch && Boolean(search.since || search.until || search.minLikes);
  const placeholder = search.kind === "users" ? "Enter username..." : "Enter search...";
  return `<form method="get" action="${escapeAttribute(action)}" class="search-field" autocomplete="off">
    <input type="hidden" name="f" value="${search.kind}">
    <input type="text" name="q" value="${escapeAttribute(search.query)}" placeholder="${placeholder}" maxlength="500" dir="auto">
    <button type="submit" aria-label="Search"><span class="icon-search"></span></button>
    ${directorySearch ? "" : `<input id="search-panel-toggle" type="checkbox"${panelOpen ? " checked" : ""}>
    <label for="search-panel-toggle" title="Advanced search"><span class="icon-down"></span></label>
    <div class="search-panel">
      <label><span>Since</span><input type="date" name="since" value="${escapeAttribute(search.since ?? "")}"></label>
      <label><span>Until</span><input type="date" name="until" value="${escapeAttribute(search.until ?? "")}"></label>
      <label><span>Minimum likes</span><input type="number" name="min_faves" min="0" value="${escapeAttribute(search.minLikes ?? "")}"></label>
    </div>`}
  </form>`;
}

function renderSearchTabs(search: SearchPage): string {
  return `<ul class="tab search-tabs">
    ${searchTab("Top", "top", search)}
    ${searchTab("Latest", "tweets", search)}
    ${searchTab("Media", "media", search)}
    ${searchTab("Users", "users", search)}
    ${searchTab("Lists", "lists", search)}
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

function renderListResult(result: SearchList): string {
  const href = `/i/lists/${encodeURIComponent(result.id)}`;
  const mentioned = mentionedUsername(result.followersContext);
  const context = result.followersContext
    ? `${result.facepiles.map((url, index) => {
        const image = `<img class="list-facepile" src="${escapeAttribute(mediaProxyUrl(url))}" alt="" loading="lazy">`;
        return index === 0 && mentioned ? `<a class="facepile-link" href="/${encodeURIComponent(mentioned)}">${image}</a>` : image;
      }).join("")}${renderMentionedText(result.followersContext)}`
    : `${result.owner.avatar ? `<a class="facepile-link" href="/${encodeURIComponent(result.owner.username)}"><img class="list-facepile" src="${escapeAttribute(mediaProxyUrl(result.owner.avatar))}" alt="" loading="lazy"></a>` : ""}<a class="fullname" href="/${encodeURIComponent(result.owner.username)}">${escapeHtml(result.owner.name)}</a><a class="username" href="/${encodeURIComponent(result.owner.username)}">@${escapeHtml(result.owner.username)}</a>`;
  return `<article class="timeline-item list-result">
    <a class="tweet-link" href="${href}" aria-label="View list"></a>
    <a class="list-result-banner" href="${href}">${result.banner ? `<img src="${escapeAttribute(mediaProxyUrl(result.banner))}" alt="" loading="lazy">` : ""}</a>
    <div class="list-result-body">
      <div class="list-result-title fullname-and-username"><a class="list-name fullname" href="${href}">${escapeHtml(result.name)}</a><span class="list-members">· ${result.members.toLocaleString("en-US")} members</span></div>
      <div class="list-result-context">${context}</div>
      ${result.description ? `<div class="list-result-description">${escapeHtml(result.description)}</div>` : ""}
    </div>
  </article>`;
}

function mentionedUsername(value: string): string {
  return [...value.matchAll(/(?:^|\s)@([A-Za-z0-9_]{1,15})(?=\s|$)/g)].at(-1)?.[1] ?? "";
}

function renderMentionedText(value: string): string {
  return escapeHtml(value).replace(
    /(^|\s)@([A-Za-z0-9_]{1,15})(?=\s|$)/g,
    (_match, prefix: string, username: string) => `${prefix}<a href="/${encodeURIComponent(username)}">@${escapeHtml(username)}</a>`,
  );
}
