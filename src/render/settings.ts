import { bodyClass, type PagePreferences, type PreferenceKey } from "../preferences";
import { escapeAttribute, renderNavbar } from "./profile";

const DISPLAY_LABELS: Partial<Record<PreferenceKey, string>> = {
  stickyProfile: "Make profile sidebar stick to top",
  stickyNav: "Keep navbar fixed to top",
  hideTweetStats: "Hide tweet stats (replies, retweets, likes)",
  hideBanner: "Hide profile banner",
  hidePins: "Hide pinned tweets",
  hideReplies: "Hide tweet replies",
  squareAvatars: "Square profile pictures",
};

const MEDIA_LABELS: Partial<Record<PreferenceKey, string>> = {
  mp4Playback: "Enable mp4 video playback (only for gifs)",
  muteVideos: "Mute videos by default",
  autoplayGifs: "Autoplay gifs",
  compactGallery: "Use compact layout in gallery view",
};

const DISPLAY_KEYS: PreferenceKey[] = ["stickyProfile", "stickyNav", "hideTweetStats", "hideBanner", "hidePins", "hideReplies", "squareAvatars"];
const MEDIA_KEYS: PreferenceKey[] = ["mp4Playback", "muteVideos", "autoplayGifs", "compactGallery"];

function prefCheckbox(key: PreferenceKey, preferences: PagePreferences): string {
  return `<label class="pref-group checkbox-container" title="${key}">${key in DISPLAY_LABELS ? DISPLAY_LABELS[key] : MEDIA_LABELS[key]}<input name="${key}" type="checkbox"${preferences[key] ? " checked" : ""}><span class="checkbox"></span></label>`;
}

function prefSelect(name: "mediaView" | "gallerySize", label: string, values: readonly string[], selected: string): string {
  return `<div class="pref-group pref-input" title="${name}"><label for="${name}">${label}</label><select name="${name}" id="${name}">${values.map((value) => {
    const display = value.charAt(0).toUpperCase() + value.slice(1);
    return `<option value="${display}"${value === selected ? " selected" : ""}>${display}</option>`;
  }).join("")}</select></div>`;
}

export function renderSettingsPage(preferences: PagePreferences, returnTo = "/settings"): string {
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
  <link rel="stylesheet" href="/css/style.css">
</head>
<body${bodyClass(preferences)}>
  ${renderNavbar("", "/settings")}
  <div class="container"><div class="overlay-panel"><fieldset class="preferences">
          <form method="post" action="/saveprefs" autocomplete="off">
            ${referer}
            <div>
              <legend>Display</legend>
              ${DISPLAY_KEYS.map((key) => prefCheckbox(key, preferences)).join("\n              ")}
              <legend>Media</legend>
              ${MEDIA_KEYS.map((key) => prefCheckbox(key, preferences)).join("\n              ")}
              ${prefSelect("gallerySize", "Gallery column size", ["small", "medium", "large"], preferences.gallerySize)}
              ${prefSelect("mediaView", "Default media view", ["timeline", "grid", "gallery"], preferences.mediaView)}
            </div>
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
