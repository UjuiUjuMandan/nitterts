import { bodyClass, PREFERENCE_KEYS, type PagePreferences, type PreferenceKey } from "../preferences";
import { escapeAttribute, renderNavbar } from "./profile";

const LABELS: Record<PreferenceKey, { title: string; description: string }> = {
  stickyNav: { title: "Sticky navigation", description: "Keep navigation visible while scrolling" },
  stickyProfile: { title: "Sticky profile", description: "Keep profile information visible on tall screens" },
  hideTweetStats: { title: "Hide tweet stats", description: "Hide replies, reposts, likes, and view counts" },
  hideBanner: { title: "Hide profile banners", description: "Do not display profile and list banners" },
  hidePins: { title: "Hide pinned tweets", description: "Exclude pinned tweets from profile timelines" },
  hideReplies: { title: "Hide replies", description: "Hide reply threads on status pages" },
  squareAvatars: { title: "Square avatars", description: "Display avatars without circular cropping" },
  mp4Playback: { title: "Enable MP4 playback", description: "Play available MP4 videos and GIFs in the page" },
  muteVideos: { title: "Mute videos", description: "Start regular videos muted" },
  autoplayGifs: { title: "Autoplay GIFs", description: "Automatically play looping GIF videos" },
};

export function renderSettingsPage(preferences: PagePreferences, returnTo = "/settings"): string {
  const fields = PREFERENCE_KEYS.map((key) => {
    const label = LABELS[key];
    return `<label class="preference-row"><input type="checkbox" name="${key}"${preferences[key] ? " checked" : ""}><span><strong>${label.title}</strong><small>${label.description}</small></span></label>`;
  }).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#1f1f1f">
  <title>Preferences | nitter</title>
  <link rel="icon" href="/favicon.ico">
  <link rel="stylesheet" href="/css/fontello.css">
  <link rel="stylesheet" href="/style.css">
</head>
<body${bodyClass(preferences)}>
  ${renderNavbar()}
  <div class="container"><main class="preferences-page">
    <section class="preferences-panel">
      <h1>Preferences</h1>
      <form method="post" action="/settings">
        <input type="hidden" name="returnTo" value="${escapeAttribute(returnTo)}">
        ${fields}
        <button type="submit" class="preferences-save">Save preferences</button>
      </form>
      <form method="post" action="/settings/reset">
        <input type="hidden" name="returnTo" value="${escapeAttribute(returnTo)}">
        <button type="submit" class="preferences-reset">Reset to defaults</button>
      </form>
    </section>
  </main></div>
</body>
</html>`;
}
