export const PREFERENCE_KEYS = [
  "stickyNav",
  "stickyProfile",
  "hideTweetStats",
  "hideBanner",
  "hidePins",
  "hideReplies",
  "squareAvatars",
  "mp4Playback",
  "hlsPlayback",
  "proxyVideos",
  "muteVideos",
  "autoplayGifs",
  "compactGallery",
  "bidiSupport",
  "hideRelated",
  "hideCommunityNotes",
  "infiniteScroll",
] as const;

export type PreferenceKey = typeof PREFERENCE_KEYS[number];
export const MEDIA_VIEWS = ["timeline", "grid", "gallery"] as const;
export const GALLERY_SIZES = ["small", "medium", "large"] as const;
export const THEMES = [
  "Nitter",
  "Auto",
  "Auto (Twitter)",
  "Black",
  "Dracula",
  "Mastodon",
  "Pleroma",
  "Twitter",
  "Twitter Dark",
] as const;
export const REPLACE_KEYS = ["replaceTwitter", "replaceYouTube", "replaceReddit"] as const;
export const SELECT_KEYS = ["mediaView", "gallerySize", "theme"] as const;
export type MediaView = typeof MEDIA_VIEWS[number];
export type GallerySize = typeof GALLERY_SIZES[number];
export type Theme = typeof THEMES[number];
export type ReplaceKey = typeof REPLACE_KEYS[number];
export type SelectKey = typeof SELECT_KEYS[number];
export type PagePreferences = Record<PreferenceKey, boolean> & {
  mediaView: MediaView;
  gallerySize: GallerySize;
  theme: Theme;
} & Record<ReplaceKey, string>;

export const DEFAULT_PREFERENCES: Readonly<PagePreferences> = Object.freeze({
  stickyNav: true,
  stickyProfile: true,
  hideTweetStats: false,
  hideBanner: false,
  hidePins: false,
  hideReplies: false,
  squareAvatars: false,
  mp4Playback: true,
  hlsPlayback: false,
  proxyVideos: false,
  muteVideos: false,
  autoplayGifs: true,
  compactGallery: false,
  bidiSupport: false,
  hideRelated: true,
  hideCommunityNotes: false,
  infiniteScroll: false,
  mediaView: "grid",
  gallerySize: "medium",
  theme: "Auto",
  replaceTwitter: "",
  replaceYouTube: "",
  replaceReddit: "",
});

// Instance-level preference defaults, sourced from NITTER_* environment
// variables. This instance defaults to serving videos directly from X's CDN
// (proxyVideos=false) and without HLS streaming; user cookies still win.
let replaceDefaults: Record<ReplaceKey, string> = {
  replaceTwitter: DEFAULT_PREFERENCES.replaceTwitter,
  replaceYouTube: DEFAULT_PREFERENCES.replaceYouTube,
  replaceReddit: DEFAULT_PREFERENCES.replaceReddit,
};
let flagDefaults: { proxyVideos?: boolean; hlsPlayback?: boolean } = {};
let themeDefault: Theme = DEFAULT_PREFERENCES.theme;

export function installPreferenceDefaults(env: {
  NITTER_REPLACE_TWITTER?: string;
  NITTER_REPLACE_YOUTUBE?: string;
  NITTER_REPLACE_REDDIT?: string;
  NITTER_PROXY_VIDEOS?: string;
  NITTER_HLS_PLAYBACK?: string;
  NITTER_THEME?: string;
} | undefined): void {
  const apply = (key: ReplaceKey, name: string, value: string | undefined): void => {
    if (value === undefined) return;
    const host = sanitizeReplace(value);
    if (host === "" || validReplacementHost(host)) {
      replaceDefaults[key] = host;
      return;
    }
    // An invalid host would silently disable replacement instance-wide.
    console.warn(JSON.stringify({ message: `ignoring invalid ${name}`, value: host }));
  };
  apply("replaceTwitter", "NITTER_REPLACE_TWITTER", env?.NITTER_REPLACE_TWITTER);
  apply("replaceYouTube", "NITTER_REPLACE_YOUTUBE", env?.NITTER_REPLACE_YOUTUBE);
  apply("replaceReddit", "NITTER_REPLACE_REDDIT", env?.NITTER_REPLACE_REDDIT);

  const applyFlag = (key: "proxyVideos" | "hlsPlayback", name: string, value: string | undefined): void => {
    if (value === undefined) return;
    const flag = parseBooleanPreference(value);
    if (flag === undefined) {
      console.warn(JSON.stringify({ message: `ignoring invalid ${name}`, value }));
      return;
    }
    flagDefaults = { ...flagDefaults, [key]: flag };
  };
  applyFlag("proxyVideos", "NITTER_PROXY_VIDEOS", env?.NITTER_PROXY_VIDEOS);
  applyFlag("hlsPlayback", "NITTER_HLS_PLAYBACK", env?.NITTER_HLS_PLAYBACK);

  if (env?.NITTER_THEME !== undefined) {
    const match = THEMES.find((theme) => theme.toLowerCase() === env.NITTER_THEME?.trim().toLowerCase());
    if (match) {
      themeDefault = match;
    } else {
      console.warn(JSON.stringify({ message: "ignoring invalid NITTER_THEME", value: env.NITTER_THEME }));
    }
  }
}

function parseBooleanPreference(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "on"].includes(normalized)) return true;
  if (["false", "0", "off", ""].includes(normalized)) return false;
  return undefined;
}

function validReplacementHost(value: string): boolean {
  try {
    const url = new URL(`https://${value}`);
    return url.host === value && url.hostname.length > 0;
  } catch {
    return false;
  }
}

export function resetPreferenceDefaults(): void {
  replaceDefaults = {
    replaceTwitter: DEFAULT_PREFERENCES.replaceTwitter,
    replaceYouTube: DEFAULT_PREFERENCES.replaceYouTube,
    replaceReddit: DEFAULT_PREFERENCES.replaceReddit,
  };
  flagDefaults = {};
  themeDefault = DEFAULT_PREFERENCES.theme;
}

export function defaultPreferences(): PagePreferences {
  return { ...DEFAULT_PREFERENCES, ...flagDefaults, theme: themeDefault, ...replaceDefaults };
}

const PREFERENCE_NAMES = [...PREFERENCE_KEYS, ...SELECT_KEYS, ...REPLACE_KEYS] as const;
const COOKIE_MAX_AGE = 31_536_000;

export function themeSlug(theme: Theme): string {
  return theme.toLowerCase().replace(/ /g, "_");
}

export function preferencesFromRequest(request: Request): PagePreferences {
  const overrides = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    if ((PREFERENCE_NAMES as readonly string[]).includes(name)) {
      try {
        overrides.set(name, decodeURIComponent(part.slice(separator + 1).trim()));
      } catch {
        overrides.set(name, part.slice(separator + 1).trim());
      }
    }
  }
  const params = new URL(request.url).searchParams;
  const bookmark = params.get("prefs");
  if (bookmark) {
    addBookmarkOverrides(overrides, bookmark);
  }
  for (const name of PREFERENCE_NAMES) {
    const value = params.get(name);
    if (value !== null) overrides.set(name, value);
  }
  return applyOverrides(overrides);
}

export function preferencesFromBookmark(bookmark: string): PagePreferences {
  const overrides = new Map<string, string>();
  addBookmarkOverrides(overrides, bookmark);
  return applyOverrides(overrides);
}

export function preferencesRedirect(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (!url.searchParams.has("prefs")) return undefined;
  const preferences = preferencesFromBookmark(url.searchParams.get("prefs") ?? "");
  url.searchParams.delete("prefs");
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",").pop()?.trim().toLowerCase();
  const secure = forwarded ? forwarded === "https" : url.protocol === "https:";
  const headers = new Headers({ location: url.toString(), "cache-control": "no-store" });
  for (const cookie of preferencesCookies(preferences, secure)) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function addBookmarkOverrides(overrides: Map<string, string>, bookmark: string): void {
  for (const pair of bookmark.split(",")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    const name = pair.slice(0, separator).trim();
    if ((PREFERENCE_NAMES as readonly string[]).includes(name)) {
      overrides.set(name, pair.slice(separator + 1));
    }
  }
}

function applyOverrides(overrides: Map<string, string>): PagePreferences {
  const preferences: PagePreferences = defaultPreferences();
  for (const [name, raw] of overrides) {
    if ((PREFERENCE_KEYS as readonly string[]).includes(name)) {
      preferences[name as PreferenceKey] = raw === "on" || raw === "true" || raw === "1";
    } else if (name === "mediaView") {
      const match = MEDIA_VIEWS.find((view) => view === raw.toLowerCase());
      if (match) preferences.mediaView = match;
    } else if (name === "gallerySize") {
      const match = GALLERY_SIZES.find((size) => size === raw.toLowerCase());
      if (match) preferences.gallerySize = match;
    } else if (name === "theme") {
      const match = THEMES.find((theme) => theme.toLowerCase() === raw.trim().toLowerCase());
      if (match) preferences.theme = match;
    } else if ((REPLACE_KEYS as readonly string[]).includes(name)) {
      preferences[name as ReplaceKey] = sanitizeReplace(raw);
    }
  }
  return preferences;
}

export function sanitizeReplace(value: string): string {
  return value.replace(/[\u0000-\u001f,]/g, "").trim().slice(0, 100);
}

function preferenceValue(preferences: PagePreferences, name: string): string {
  if ((PREFERENCE_KEYS as readonly string[]).includes(name)) {
    return preferences[name as PreferenceKey] ? "on" : "";
  }
  const value = (preferences as unknown as Record<string, string>)[name] ?? "";
  return value;
}

function isDefault(preferences: PagePreferences, name: string): boolean {
  return preferenceValue(preferences, name) === preferenceValue(defaultPreferences(), name);
}

// Mirrors upstream Nitter: one cookie per preference, only non-default values
// stored, default-valued keys expired so stale entries clear on save.
export function preferencesCookies(preferences: PagePreferences, secure: boolean): string[] {
  return PREFERENCE_NAMES.map((name) =>
    isDefault(preferences, name)
      ? cookieHeader(name, "", secure, 0)
      : cookieHeader(name, encodeURIComponent(preferenceValue(preferences, name)), secure, COOKIE_MAX_AGE),
  );
}

export function resetPreferenceCookies(secure: boolean): string[] {
  return PREFERENCE_NAMES.map((name) => cookieHeader(name, "", secure, 0));
}

export function encodePrefs(preferences: PagePreferences): string {
  return PREFERENCE_NAMES
    .filter((name) => !isDefault(preferences, name))
    .map((name) => `${name}=${preferenceValue(preferences, name)}`)
    .join(",");
}

export function bodyClass(preferences: PagePreferences): string {
  return preferences.stickyNav ? ' class="fixed-nav"' : "";
}

function cookieHeader(name: string, value: string, secure: boolean, maxAge: number): string {
  return `${name}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
