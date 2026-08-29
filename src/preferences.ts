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
  "compactGallery",
] as const;

export type PreferenceKey = typeof PREFERENCE_KEYS[number];
export const MEDIA_VIEWS = ["timeline", "grid", "gallery"] as const;
export const GALLERY_SIZES = ["small", "medium", "large"] as const;
export type MediaView = typeof MEDIA_VIEWS[number];
export type GallerySize = typeof GALLERY_SIZES[number];
export type PagePreferences = Record<PreferenceKey, boolean> & {
  mediaView: MediaView;
  gallerySize: GallerySize;
};

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
  compactGallery: false,
  mediaView: "grid",
  gallerySize: "medium",
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
  const mediaView = { timeline: "t", grid: "g", gallery: "a" }[preferences.mediaView];
  const gallerySize = { small: "s", medium: "m", large: "l" }[preferences.gallerySize];
  return `v2.${mask.toString(36)}.${mediaView}.${gallerySize}`;
}

export function decodePreferences(value: string): PagePreferences {
  const legacy = /^v1\.([0-9a-z]+)$/.exec(value);
  const current = /^v2\.([0-9a-z]+)\.([tga])\.([sml])$/.exec(value);
  const match = legacy ?? current;
  if (!match) return { ...DEFAULT_PREFERENCES };
  const mask = Number.parseInt(match[1] ?? "", 36);
  const bitCount = legacy ? PREFERENCE_KEYS.length - 1 : PREFERENCE_KEYS.length;
  if (!Number.isSafeInteger(mask) || mask < 0 || mask >= 1 << bitCount || mask.toString(36) !== match[1]) {
    return { ...DEFAULT_PREFERENCES };
  }
  const booleans = Object.fromEntries(PREFERENCE_KEYS.map((key, index) => [key, Boolean(mask & (1 << index))])) as Record<PreferenceKey, boolean>;
  if (legacy) return { ...booleans, mediaView: DEFAULT_PREFERENCES.mediaView, gallerySize: DEFAULT_PREFERENCES.gallerySize };
  const mediaView = ({ t: "timeline", g: "grid", a: "gallery" } as const)[current![2] as "t" | "g" | "a"];
  const gallerySize = ({ s: "small", m: "medium", l: "large" } as const)[current![3] as "s" | "m" | "l"];
  return { ...booleans, mediaView, gallerySize };
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
