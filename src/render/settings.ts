import { bodyClass, THEMES, type PagePreferences, type PreferenceKey } from "../preferences";
import { escapeAttribute, headScripts, renderNavbar, themeLink } from "./profile";

const DISPLAY_LABELS: Partial<Record<PreferenceKey, string>> = {
  infiniteScroll: "Infinite scrolling (experimental, requires JavaScript)",
  stickyProfile: "Make profile sidebar stick to top",
  stickyNav: "Keep navbar fixed to top",
  bidiSupport: "Support bidirectional text (makes clicking on tweets harder)",
  hideTweetStats: "Hide tweet stats (replies, retweets, likes)",
  hideBanner: "Hide profile banner",
  hidePins: "Hide pinned tweets",
  hideReplies: "Hide tweet replies",
  hideRelated: "Hide related tweets under replies",
  hideCommunityNotes: "Hide community notes",
  squareAvatars: "Square profile pictures",
};

const MEDIA_LABELS: Partial<Record<PreferenceKey, string>> = {
  mp4Playback: "Enable mp4 video playback (only for gifs)",
  hlsPlayback: "Enable HLS video streaming (requires JavaScript)",
  proxyVideos: "Proxy video streaming through the server (might be slow)",
  muteVideos: "Mute videos by default",
  autoplayGifs: "Autoplay gifs",
  compactGallery: "Use compact layout in gallery view",
};

const DISPLAY_KEYS: PreferenceKey[] = ["infiniteScroll", "stickyProfile", "stickyNav", "bidiSupport", "hideTweetStats", "hideBanner", "hidePins", "hideReplies", "hideRelated", "hideCommunityNotes", "squareAvatars"];
const MEDIA_KEYS: PreferenceKey[] = ["mp4Playback", "hlsPlayback", "proxyVideos", "muteVideos", "autoplayGifs", "compactGallery"];

function prefCheckbox(key: PreferenceKey, preferences: PagePreferences): string {
  return `<label class="pref-group checkbox-container" title="${key}">${key in DISPLAY_LABELS ? DISPLAY_LABELS[key] : MEDIA_LABELS[key]}<input name="${key}" type="checkbox"${preferences[key] ? " checked" : ""}><span class="checkbox"></span></label>`;
}

function prefSelect(name: "mediaView" | "gallerySize", label: string, values: readonly string[], selected: string): string {
  return `<div class="pref-group pref-input" title="${name}"><label for="${name}">${label}</label><select name="${name}" id="${name}">${values.map((value) => {
    const display = value.charAt(0).toUpperCase() + value.slice(1);
    return `<option value="${display}"${value === selected ? " selected" : ""}>${display}</option>`;
  }).join("")}</select></div>`;
}

function themeSelect(preferences: PagePreferences): string {
  return `<div class="pref-group pref-input" title="theme"><label for="theme">Theme</label><select name="theme" id="theme">${THEMES.map((theme) => `<option value="${escapeAttribute(theme)}"${theme === preferences.theme ? " selected" : ""}>${escapeAttribute(theme)}</option>`).join("")}</select></div>`;
}

function prefInput(name: "replaceTwitter" | "replaceYouTube" | "replaceReddit", label: string, placeholder: string, value: string, autofocus = false): string {
  return `<div class="pref-group pref-input" title="${name}"><label for="${name}">${label}</label><input name="${name}" id="${name}" type="text" placeholder="${escapeAttribute(placeholder)}" value="${escapeAttribute(value)}"${autofocus ? ' autofocus=""' : ""}></div>`;
}

export function renderSettingsPage(preferences: PagePreferences, returnTo = "/settings", prefsUrl = ""): string {
  const referer = `<input type="hidden" name="referer" value="${escapeAttribute(returnTo)}">`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#1f1f1f">
  <title>Preferences | nitter</title>
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/css/fontello.css">
  <link rel="stylesheet" href="/css/style.css">${themeLink(preferences)}${headScripts(preferences)}
</head>
<body${bodyClass(preferences)}>
  ${renderNavbar("", "/settings")}
  <div class="container"><div class="overlay-panel"><fieldset class="preferences">
          <form method="post" action="/saveprefs" autocomplete="off">
             ${referer}
             <div>
               <legend>Display</legend>
               ${themeSelect(preferences)}
               ${DISPLAY_KEYS.map((key) => prefCheckbox(key, preferences)).join("\n              ")}
              <legend>Media</legend>
               ${MEDIA_KEYS.map((key) => prefCheckbox(key, preferences)).join("\n              ")}
               ${prefSelect("gallerySize", "Gallery column size", ["small", "medium", "large"], preferences.gallerySize)}
               ${prefSelect("mediaView", "Default media view", ["timeline", "grid", "gallery"], preferences.mediaView)}
              <legend>Link replacements (blank to disable)</legend>
              ${prefInput("replaceTwitter", "Twitter -&gt; Nitter", "Nitter hostname", preferences.replaceTwitter)}
              ${prefInput("replaceYouTube", "YouTube -&gt; Piped/Invidious", "Piped hostname", preferences.replaceYouTube, true)}
              ${prefInput("replaceReddit", "Reddit -&gt; Teddit/Libreddit", "Teddit hostname", preferences.replaceReddit)}
             </div>
            <legend>Bookmark</legend>
            <p class="bookmark-note">Save this URL to restore your preferences (?prefs works on all pages)</p>
            <pre class="prefs-code">${escapeAttribute(prefsUrl)}</pre>
            <p class="bookmark-note">You can override preferences with query parameters (e.g. <code>?hlsPlayback=on</code>). These overrides aren't saved to cookies, and links won't retain the parameters. Intended for configuring RSS feeds and other cookieless environments. Hover over a preference to see its name.</p>
            <h4 class="note">Preferences are stored client-side using cookies without any personal information.</h4>
            <button class="pref-submit" type="submit">Save preferences</button>
          </form>
          <form class="pref-reset" method="post" action="/resetprefs">
            ${referer}
            <button type="submit">Reset preferences</button>
          </form>
        </fieldset></div></div>
</body>
</html>`;
}
