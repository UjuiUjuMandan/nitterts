import { bodyClass, type PagePreferences } from "../preferences";
import { INSTANCE_COMMIT_URL, INSTANCE_VERSION } from "../generated/version";
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
    <h1>About</h1>
    <p>Nitter is a free and open source alternative X front-end focused on privacy and performance. This Cloudflare Pages port is available on <a href="https://github.com/UjuiUjuMandan/nitterts">GitHub</a> and tracks the original <a href="https://github.com/zedeus/nitter">Nitter project</a>.</p>
    <ul>
      <li>No ads or analytics</li>
      <li>All X requests go through the backend</li>
      <li>Prevents X from tracking your IP or JavaScript fingerprint</li>
      <li>Lightweight and responsive</li>
      <li>RSS feeds and themes</li>
      <li>AGPLv3 licensed</li>
    </ul>
    <p>Nitter's community wiki contains <a href="https://github.com/zedeus/nitter/wiki/Instances">instances</a> and <a href="https://github.com/zedeus/nitter/wiki/Extensions">browser extensions</a>.</p>
    <h2>Why use Nitter?</h2>
    <p>X requires JavaScript and an account for most browsing. A Nitter instance retrieves public content server-side, reducing client-side tracking and page weight while preserving a simple browsing experience.</p>
    <h2>Donating</h2>
    <p>Support the original Nitter developer on <a href="https://liberapay.com/zedeus">Liberapay</a> or <a href="https://patreon.com/nitter">Patreon</a>.</p>
    <h2>Instance info</h2>
    <p>Version <a href="${escapeAttribute(INSTANCE_COMMIT_URL)}">${escapeHtml(INSTANCE_VERSION)}</a></p>
  </main></div>
</body>
</html>`;
}
