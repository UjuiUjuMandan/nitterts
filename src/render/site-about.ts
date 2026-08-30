import { bodyClass, type PagePreferences } from "../preferences";
import { ABOUT_MARKDOWN } from "../generated/about";
import { INSTANCE_COMMIT_URL, INSTANCE_VERSION } from "../generated/version";
import { renderMarkdown } from "../markdown";
import { escapeAttribute, escapeHtml, headScripts, renderNavbar, themeLink } from "./profile";

export function renderSiteAboutPage(preferences: PagePreferences): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#1f1f1f">
  <title>About | nitter</title>
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/css/fontello.css">
  <link rel="stylesheet" href="/css/style.css">${themeLink(preferences)}${headScripts(preferences)}
</head>
<body${bodyClass(preferences)}>
  ${renderNavbar("", "/about")}
  <div class="container"><main class="overlay-panel">
    ${renderMarkdown(ABOUT_MARKDOWN)}
    <h2>Instance info</h2>
    <p>Version <a href="${escapeAttribute(INSTANCE_COMMIT_URL)}">${escapeHtml(INSTANCE_VERSION)}</a></p>
  </main></div>
</body>
</html>`;
}
