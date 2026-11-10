import { bodyClass, type PagePreferences } from "../preferences";
import { escapeAttribute, escapeHtml, headScripts, renderNavbar, themeLink } from "./profile";

// View model for /settings/sessions. Everything rendered here is anonymous by
// construction: sessions are identified by HMAC labels only, never by X user
// id or username.

export type SessionSource = "operator" | "donor" | "you";

export type PoolSessionView = {
  label: string;
  source: SessionSource;
  visibility: "public" | "private";
  status: "limited" | "busy" | "ready" | "idle";
  createdYear: string;
  donatedAt?: string;
};

export type SessionSettingsView = {
  donationsEnabled: boolean;
  pool: PoolSessionView[];
  stewardCount: number;
  error?: string;
  notice?: string;
  prefillUsername?: string;
};

const SOURCE_LABELS: Record<SessionSource, string> = {
  operator: "operator",
  donor: "donated",
  you: "you",
};

const STATUS_LABELS: Record<PoolSessionView["status"], string> = {
  limited: "rate-limited",
  busy: "in flight",
  ready: "ready",
  idle: "idle",
};

function poolRow(entry: PoolSessionView): string {
  const visibility = entry.source === "operator"
    ? "shared"
    : entry.visibility === "public" ? "public" : "private (yours)";
  return `<tr><td>${escapeHtml(entry.label)}</td><td>${SOURCE_LABELS[entry.source]}</td><td>${visibility}</td><td>${STATUS_LABELS[entry.status]}</td><td>${escapeHtml(entry.createdYear)}</td></tr>`;
}

function stewardRow(entry: PoolSessionView): string {
  const toggle = entry.visibility === "public"
    ? `<form method="post" action="/settings/sessions"><input type="hidden" name="action" value="visibility"><input type="hidden" name="session" value="${escapeAttribute(entry.label)}"><input type="hidden" name="visibility" value="private"><button type="submit">Use for my requests only</button></form>`
    : `<form method="post" action="/settings/sessions"><input type="hidden" name="action" value="visibility"><input type="hidden" name="session" value="${escapeAttribute(entry.label)}"><input type="hidden" name="visibility" value="public"><button type="submit">Use for all visitors</button></form>`;
  const revoke = `<form method="post" action="/settings/sessions"><input type="hidden" name="action" value="revoke"><input type="hidden" name="session" value="${escapeAttribute(entry.label)}"><button type="submit">Remove</button></form>`;
  return `<div class="pref-group"><span>${escapeHtml(entry.label)}</span><span>${entry.visibility === "public" ? "public" : "private"}${entry.donatedAt ? `, donated ${escapeHtml(entry.donatedAt)}` : ""}</span>${toggle}${revoke}</div>`;
}

export function renderSessionSettingsPage(preferences: PagePreferences, view: SessionSettingsView): string {
  const error = view.error ? `<div class="error-panel"><p>${escapeHtml(view.error)}</p></div>` : "";
  const notice = view.notice ? `<p class="bookmark-note">${escapeHtml(view.notice)}</p>` : "";
  const donateForm = view.donationsEnabled ? `
          <form method="post" action="/settings/sessions" autocomplete="off">
            <input type="hidden" name="action" value="donate">
            <legend>Donate a session</legend>
            <p class="bookmark-note">Log in to x.com, open DevTools &rarr; Application &rarr; Cookies and copy the <code>auth_token</code> and <code>ct0</code> values of an account you are willing to share. Sessions are verified against X before being accepted.</p>
            <p class="bookmark-note">X suspends accounts it catches serving scrape traffic; donate a burner, not your main account. You can remove the session here at any time, and logging out of the session on X invalidates it everywhere.</p>
            <div class="pref-group pref-input"><label for="username">X username</label><input name="username" id="username" type="text" maxlength="15" placeholder="burner_account"${view.prefillUsername ? ` value="${escapeAttribute(view.prefillUsername)}"` : ""} autofocus=""></div>
            <div class="pref-group pref-input"><label for="auth_token">auth_token cookie</label><input name="auth_token" id="auth_token" type="password" autocomplete="off" placeholder="32 hex characters"></div>
            <div class="pref-group pref-input"><label for="ct0">ct0 cookie</label><input name="ct0" id="ct0" type="password" autocomplete="off" placeholder="hex characters"></div>
            <label class="pref-group checkbox-container"><input type="radio" name="visibility" value="public" checked><span class="checkbox"></span>Use this session for all visitors of this instance</label>
            <label class="pref-group checkbox-container"><input type="radio" name="visibility" value="private"><span class="checkbox"></span>Use this session only for my own requests</label>
            <button class="pref-submit" type="submit">Donate session</button>
          </form>` : `
          <legend>Donate a session</legend>
          <p class="bookmark-note">Session donations are not enabled on this instance (missing <code>SESSION_STORE</code> binding).</p>`;
  const steward = view.stewardCount > 0 ? `
          <legend>Your donated sessions (${view.stewardCount})</legend>
          <p class="bookmark-note">Managed through an anonymous cookie in this browser. Clearing cookies loses access; removing a session here only stops this instance from using it.</p>
          ${view.pool.filter((entry) => entry.source === "you").map(stewardRow).join("\n          ")}` : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#1f1f1f">
  <title>Sessions | nitter</title>
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/css/fontello.css">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/session-settings.css">${themeLink(preferences)}${headScripts(preferences)}
</head>
<body${bodyClass(preferences)}>
  ${renderNavbar("", "/settings/sessions")}
  <div class="container"><div class="overlay-panel"><fieldset class="preferences">
          ${error}${notice}
          <legend>Live session pool (${view.pool.length})</legend>
          <p class="bookmark-note">Sessions this instance can use to fetch from X. Labels are anonymous and rotate with the instance secret; account identities are never shown.</p>
          <table>
            <thead><tr><th>Session</th><th>Provided by</th><th>Visibility</th><th>Status</th><th>Account age</th></tr></thead>
            <tbody>${view.pool.map(poolRow).join("")}</tbody>
          </table>
          ${steward}
          ${donateForm}
          <p class="bookmark-note"><a href="/settings">Back to preferences</a></p>
        </fieldset></div></div>
</body>
</html>`;
}
