import { bodyClass, type PagePreferences } from "../preferences";
import { renderNavbar } from "./profile";

export function renderHomePage(preferences: PagePreferences): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#1f1f1f">
  <title>nitter</title>
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/css/fontello.css">
  <link rel="stylesheet" href="/css/style.css">
</head>
<body${bodyClass(preferences)}>
  ${renderNavbar("", "/")}
  <div class="container">
    <main class="panel-container home-panel">
      <div class="search-bar"><form method="get" action="/search" autocomplete="off">
        <input type="hidden" name="f" value="tweets">
        <input type="text" name="q" placeholder="Search..." maxlength="500" autofocus dir="auto">
        <button type="submit" aria-label="Search"><span class="icon-search"></span></button>
      </form></div>
    </main>
  </div>
</body>
</html>`;
}
