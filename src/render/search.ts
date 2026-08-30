import { mediaProxyUrl } from "../media";
import { bodyClass, DEFAULT_PREFERENCES, type PagePreferences } from "../preferences";
import type { Profile } from "../x/profile";
import type { PhotoRailItem, SearchKind, SearchList, SearchResults } from "../x/timeline";
import {
  escapeAttribute,
  escapeHtml,
  headScripts,
  renderNavbar,
  renderPhotoRail,
  renderProfileCard,
  renderTweet,
  renderUserResult,
  themeLink,
} from "./profile";

export type SearchPage = {
  query: string;
  kind: SearchKind;
  cursor?: string;
  username?: string;
  since?: string;
  until?: string;
  minLikes?: string;
  filters?: readonly string[];
  excludes?: readonly string[];
};

// Mirrors upstream views/search.nim toggles and query.nim validFilters.
const SEARCH_TOGGLES: readonly (readonly [string, string])[] = [
  ["nativeretweets", "Retweets"],
  ["media", "Media"],
  ["videos", "Videos"],
  ["news", "News"],
  ["native_video", "Native videos"],
  ["replies", "Replies"],
  ["links", "Links"],
  ["images", "Images"],
  ["quote", "Quotes"],
  ["spaces", "Spaces"],
];

export const VALID_SEARCH_FILTERS = new Set([
  ...SEARCH_TOGGLES.map(([name]) => name),
  "twimg",
  "consumer_video",
  "mentions",
  "retweets",
]);

export function renderSearchPage(
  search: SearchPage,
  results?: SearchResults,
  profile?: Profile,
  photos: PhotoRailItem[] = [],
  preferences: PagePreferences = { ...DEFAULT_PREFERENCES },
): string {
  const title = search.query ? `Search (${search.query}) | nitter` : "Search | nitter";
  const hasTerms = Boolean(search.query || search.username || search.since || search.until || search.minLikes || search.filters?.length || search.excludes?.length);
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
    <div class="timeline">${body}${more}<div class="timeline-footer"></div><div class="top-ref"><div class="icon-container"><a class="icon-down" href="#" title="Back to top"></a></div></div></div>`;
  const content = `<section class="timeline-container search-results">${contentBody}</section>`;
  const main = profile
    ? `<main class="profile-tabs">
        ${profile.banner && !preferences.hideBanner ? `<div class="profile-banner"><a href="${escapeAttribute(mediaProxyUrl(profile.banner))}" target="_blank" rel="noopener"><img src="${escapeAttribute(mediaProxyUrl(profile.banner))}" alt=""></a></div>` : ""}
        <aside class="profile-tab${preferences.stickyProfile ? " sticky" : ""}">${renderProfileCard(profile, preferences)}${renderPhotoRail(profile, photos)}</aside>
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
  <link rel="stylesheet" href="/css/style.css">${themeLink(preferences)}${headScripts(preferences)}
</head>
<body${bodyClass(preferences)}>
  ${renderNavbar("", currentPath, xSearchUrl(search))}
  <div class="container">${main}</div>
</body>
</html>`;
}

function renderSearchForm(action: string, search: SearchPage): string {
  const directorySearch = search.kind === "users" || search.kind === "lists";
  const filters = search.filters ?? [];
  const excludes = search.excludes ?? [];
  // Upstream keeps the panel closed for profile searches.
  const panelOpen = !directorySearch && !search.username
    && Boolean(filters.length || excludes.length || search.since || search.until || search.minLikes);
  const placeholder = search.kind === "users" ? "Enter username..." : "Enter search...";
  const queryInput = `<div class="pref-group pref-input pref-inline" title="q"><input type="text" name="q" value="${escapeAttribute(search.query)}" placeholder="${placeholder}" maxlength="500" dir="auto"${search.query ? "" : " autofocus"}></div>`;
  const toggles = (prefix: "f" | "e", active: readonly string[]): string =>
    `<div class="search-toggles">${SEARCH_TOGGLES.map(([name, label]) => `<label class="pref-group checkbox-container" title="${prefix}-${name}">${label}<input name="${prefix}-${name}" type="checkbox"${active.includes(name) ? " checked" : ""}><span class="checkbox"></span></label>`).join("")}</div>`;
  const dateInput = (name: "since" | "until"): string =>
    `<span class="date-input"><input type="date" name="${name}" value="${escapeAttribute(search[name] ?? "")}"><div class="icon-container"><span class="icon-calendar"></span></div></span>`;
  return `<form method="get" action="${escapeAttribute(action)}" class="search-field" autocomplete="off">
    <input type="hidden" name="f" value="${search.kind}">
    ${queryInput}
    <button type="submit" aria-label="Search"><span class="icon-search"></span></button>
    ${directorySearch ? "" : `<input id="search-panel-toggle" type="checkbox"${panelOpen ? " checked" : ""}>
    <label for="search-panel-toggle"><span class="icon-down"></span></label>
    <div class="search-panel">
      <span class="search-title">Filter</span>
      ${toggles("f", filters)}
      <span class="search-title">Exclude</span>
      ${toggles("e", excludes)}
      <div class="search-row">
        <div><span class="search-title">Time range</span><div class="date-range">${dateInput("since")}<span class="search-title">-</span>${dateInput("until")}</div></div>
        <div><span class="search-title">Minimum likes</span><div class="pref-group pref-input"><input type="number" name="min_faves" placeholder="Number..." min="0" step="1" value="${escapeAttribute(search.minLikes ?? "")}"></div></div>
      </div>
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
  for (const filter of search.filters ?? []) params.set(`f-${filter}`, "on");
  for (const exclude of search.excludes ?? []) params.set(`e-${exclude}`, "on");
  if (search.since) params.set("since", search.since);
  if (search.until) params.set("until", search.until);
  if (search.minLikes) params.set("min_faves", search.minLikes);
  return params;
}

export function xSearchUrl(search: SearchPage): string {
  const terms: string[] = [];
  if (search.kind !== "users") {
    const excludes = search.excludes ?? [];
    if (search.username) terms.push(`(from:${search.username})`);
    if (search.username && search.kind === "media") terms.push("(filter:self_threads OR -filter:replies)");
    if (!excludes.includes("nativeretweets")) terms.push("include:nativeretweets");
    for (const filter of search.filters ?? []) terms.push(`filter:${filter}`);
    for (const exclude of excludes.filter((name) => name !== "nativeretweets")) terms.push(`-filter:${exclude}`);
    if (search.since) terms.push(`since:${search.since}`);
    if (search.until) terms.push(`until:${search.until}`);
    if (search.minLikes) terms.push(`min_faves:${search.minLikes}`);
  }
  if (search.query) terms.push(search.query);
  const params = new URLSearchParams({
    f: search.kind === "users" ? "user" : "live",
    q: terms.filter(Boolean).join(" "),
    src: "typed_query",
  });
  return `https://x.com/search?${params}`;
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
  return `<div class="timeline-item list-result">
    <a class="tweet-link" href="${href}" aria-label="View list"></a>
    <a class="list-result-banner" href="${href}">${result.banner ? `<img src="${escapeAttribute(mediaProxyUrl(result.banner))}" alt="" loading="lazy">` : ""}</a>
    <div class="list-result-body">
      <div class="list-result-title fullname-and-username"><a class="list-name fullname" href="${href}">${escapeHtml(result.name)}</a><span class="list-members">· ${result.members.toLocaleString("en-US")} members</span></div>
      <div class="list-result-context">${context}</div>
      ${result.description ? `<div class="list-result-description">${escapeHtml(result.description)}</div>` : ""}
    </div>
  </div>`;
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
