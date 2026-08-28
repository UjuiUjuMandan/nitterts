export const PREFERENCE_KEYS = [
  "stickyNav",
  "stickyProfile",
  "hideTweetStats",
  "hideBanner",
  "hidePins",
  "hideReplies",
  "squareAvatars",
  "mp4Playback",
  "muteVideos",
  "autoplayGifs",
] as const;

export type PreferenceKey = typeof PREFERENCE_KEYS[number];
export type PagePreferences = Record<PreferenceKey, boolean>;

export const DEFAULT_PREFERENCES: Readonly<PagePreferences> = Object.freeze({
  stickyNav: true,
  stickyProfile: true,
  hideTweetStats: false,
  hideBanner: false,
  hidePins: false,
  hideReplies: false,
  squareAvatars: false,
  mp4Playback: true,
  muteVideos: false,
  autoplayGifs: true,
});

export const PREFERENCES_COOKIE = "nitter_prefs";

export function preferencesFromRequest(request: Request): PagePreferences {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== PREFERENCES_COOKIE) continue;
    try {
      return decodePreferences(decodeURIComponent(part.slice(separator + 1).trim()));
    } catch {
      return { ...DEFAULT_PREFERENCES };
    }
  }
  return { ...DEFAULT_PREFERENCES };
}

export function encodePreferences(preferences: PagePreferences): string {
  const mask = PREFERENCE_KEYS.reduce(
    (value, key, index) => preferences[key] ? value | (1 << index) : value,
    0,
  );
  return `v1.${mask.toString(36)}`;
}

export function decodePreferences(value: string): PagePreferences {
  const match = /^v1\.([0-9a-z]+)$/.exec(value);
  if (!match) return { ...DEFAULT_PREFERENCES };
  const mask = Number.parseInt(match[1] ?? "", 36);
  if (!Number.isSafeInteger(mask) || mask < 0 || mask >= 1 << PREFERENCE_KEYS.length || mask.toString(36) !== match[1]) {
    return { ...DEFAULT_PREFERENCES };
  }
  return Object.fromEntries(PREFERENCE_KEYS.map((key, index) => [key, Boolean(mask & (1 << index))])) as PagePreferences;
}

export function preferencesCookie(preferences: PagePreferences, secure: boolean): string {
  return cookieHeader(encodePreferences(preferences), secure, 31_536_000);
}

export function clearPreferencesCookie(secure: boolean): string {
  return cookieHeader("", secure, 0);
}

export function bodyClass(preferences: PagePreferences): string {
  return preferences.stickyNav ? "" : ' class="non-sticky-nav"';
}

function cookieHeader(value: string, secure: boolean, maxAge: number): string {
  return `${PREFERENCES_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
