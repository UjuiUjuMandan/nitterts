import { mediaProxyUrl } from "../media";
import { bodyClass, DEFAULT_PREFERENCES, type PagePreferences } from "../preferences";
import type { Profile } from "../x/profile";
import { escapeAttribute, escapeHtml, renderNavbar } from "./profile";

export function renderAboutPage(profile: Profile, preferences: PagePreferences = { ...DEFAULT_PREFERENCES }): string {
  const base = `/${encodeURIComponent(profile.username)}`;
  const joined = monthYear(profile.joinedAt);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#1f1f1f">
  <title>About @${escapeHtml(profile.username)} | nitter</title>
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/css/fontello.css">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body${bodyClass(preferences)}>
  ${renderNavbar(base, `${base}/about`)}
  <div class="container">
    <main class="about-account">
      <header class="about-account-header">
        ${profile.avatar ? `<a class="about-account-avatar" href="${base}"><img class="avatar${preferences.squareAvatars ? "" : " round"}" src="${escapeAttribute(mediaProxyUrl(profile.avatar))}" alt=""></a>` : ""}
        <div class="about-account-name"><a class="profile-card-fullname" href="${base}">${escapeHtml(profile.name)}</a><a class="profile-card-username" href="${base}">@${escapeHtml(profile.username)}</a></div>
      </header>
      <div class="about-account-body">
        ${joined ? aboutRow("calendar", "Date joined", joined) : ""}
        ${profile.basedIn ? aboutRow("location", "Account based in", profile.basedIn) : ""}
      </div>
    </main>
  </div>
</body>
</html>`;
}

function aboutRow(icon: string, label: string, value: string): string {
  return `<div class="about-account-row"><span class="icon-${icon}"></span><div><span class="about-account-label">${escapeHtml(label)}</span><span class="about-account-value">${escapeHtml(value)}</span></div></div>`;
}

function monthYear(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}
