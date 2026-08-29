import { mediaProxyUrl } from "../media";
import { bodyClass, DEFAULT_PREFERENCES, type PagePreferences } from "../preferences";
import type { AccountInfo, Profile } from "../x/profile";
import { escapeAttribute, escapeHtml, renderNavbar } from "./profile";

export function renderAboutPage(profile: Profile, preferences: PagePreferences = { ...DEFAULT_PREFERENCES }, accountInfo?: AccountInfo): string {
  const base = `/${encodeURIComponent(profile.username)}`;
  const joined = monthYear(profile.joinedAt);
  const info = accountInfo;
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
        ${info?.basedIn ? aboutRow("location", "Account based in", info.basedIn) : ""}
        ${verifiedRows(info)}
        ${affiliateRow(info)}
        ${usernameChangeRow(info)}
        ${info?.source ? aboutRow("link", "Connected via", info.source) : ""}
      </div>
    </main>
  </div>
</body>
</html>`;
}

function verifiedRows(info: AccountInfo | undefined): string {
  if (!info || info.verifiedType === "none") return "";
  let rows = "";
  if (info.overrideVerifiedYear) {
    const year = Math.abs(info.overrideVerifiedYear);
    rows += aboutRow("ok", "Verified", `Since ${year}${info.overrideVerifiedYear < 0 ? " BCE" : ""}`);
  } else if (info.verifiedSinceAt) {
    rows += aboutRow("ok", "Verified", `Since ${monthYear(new Date(info.verifiedSinceAt).toISOString())}`);
  }
  if (info.isIdentityVerified) rows += aboutRow("ok", "ID Verified", "Yes");
  return rows;
}

function affiliateRow(info: AccountInfo | undefined): string {
  if (!info?.affiliateUsername) return "";
  const value = info.affiliateLabel
    ? `${info.affiliateLabel} (@${info.affiliateUsername})`
    : `@${info.affiliateUsername}`;
  return `<div class="about-account-row"><span class="icon-group"></span><div><span class="about-account-label">An affiliate of</span><span class="about-account-value"><a href="/${encodeURIComponent(info.affiliateUsername)}">${escapeHtml(value)}</a></span></div></div>`;
}

function usernameChangeRow(info: AccountInfo | undefined): string {
  if (!info?.usernameChanges) return "";
  const label = `${info.usernameChanges} username change${info.usernameChanges > 1 ? "s" : ""}`;
  const value = info.lastUsernameChangeAt
    ? `Last on ${monthYear(new Date(info.lastUsernameChangeAt).toISOString())}`
    : "";
  return `<div class="about-account-row"><span class="about-account-at">@</span><div><span class="about-account-label">${escapeHtml(label)}</span>${value ? `<span class="about-account-value">${escapeHtml(value)}</span>` : ""}</div></div>`;
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
