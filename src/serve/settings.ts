import { encodePrefs, preferencesFromRequest, sanitizeReplace, THEMES, GALLERY_SIZES, MEDIA_VIEWS, PREFERENCE_KEYS, preferencesCookies, resetPreferenceCookies, type GallerySize, type MediaView, type PagePreferences, type Theme } from "../preferences";
import { renderSettingsPage } from "../render/settings";
import { effectiveRequestUrl, readForm, safeReturnTo, validateMutation } from "./form";

export function serveSettingsPage(request: Request): Response {
  const url = effectiveRequestUrl(request);
  const returnTo = safeReturnTo(url.searchParams.get("referer"), url) ?? "/settings";
  const preferences = preferencesFromRequest(request);
  const prefsUrl = `${url.origin}/?prefs=${encodePrefs(preferences)}`;
  return settingsHtml(renderSettingsPage(preferences, returnTo, prefsUrl));
}

export async function serveSavePreferences(request: Request): Promise<Response> {
  const rejected = validateMutation(request);
  if (rejected) return rejected;
  const params = await readForm(request);
  if (params instanceof Response) return params;
  const allowed = new Set<string>([...PREFERENCE_KEYS, "mediaView", "gallerySize", "theme", "replaceTwitter", "replaceYouTube", "replaceReddit", "returnTo", "referer"]);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) return new Response("Invalid preference fields", { status: 400 });
  }
  const entries: Array<[typeof PREFERENCE_KEYS[number], boolean]> = [];
  for (const key of PREFERENCE_KEYS) {
    const value = params.get(key);
    if (value !== null && value !== "on" && value !== "true" && value !== "1") {
      return new Response("Invalid preference value", { status: 400 });
    }
    entries.push([key, value !== null]);
  }
  const mediaView = normalizedChoice(params.get("mediaView") ?? "grid", MEDIA_VIEWS);
  const gallerySize = normalizedChoice(params.get("gallerySize") ?? "medium", GALLERY_SIZES);
  const theme = normalizedTheme(params.get("theme") ?? "Nitter");
  if (!mediaView || !gallerySize || !theme) return new Response("Invalid preference value", { status: 400 });
  const preferences = {
    ...Object.fromEntries(entries),
    mediaView,
    gallerySize,
    theme,
    replaceTwitter: sanitizeReplace(params.get("replaceTwitter") ?? ""),
    replaceYouTube: sanitizeReplace(params.get("replaceYouTube") ?? ""),
    replaceReddit: sanitizeReplace(params.get("replaceReddit") ?? ""),
  } as PagePreferences;
  const returnTo = safeReturnTo(params.get("returnTo") ?? params.get("referer"), effectiveRequestUrl(request)) ?? "/settings";
  return redirectWithCookies(request, returnTo, preferencesCookies(preferences, effectiveRequestUrl(request).protocol === "https:"));
}

function normalizedChoice<T extends string>(value: string, choices: readonly T[]): T | undefined {
  const normalized = value.toLowerCase();
  return choices.find((choice) => choice === normalized);
}

function normalizedTheme(value: string): Theme | undefined {
  const normalized = value.trim().toLowerCase();
  return THEMES.find((theme) => theme.toLowerCase() === normalized);
}

export async function serveResetPreferences(request: Request): Promise<Response> {
  const rejected = validateMutation(request);
  if (rejected) return rejected;
  const params = await readForm(request);
  if (params instanceof Response) return params;
  const allowed = new Set(["returnTo", "referer"]);
  for (const key of params.keys()) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) return new Response("Invalid preference fields", { status: 400 });
  }
  const returnTo = safeReturnTo(params.get("returnTo") ?? params.get("referer"), effectiveRequestUrl(request)) ?? "/settings";
  return redirectWithCookies(request, returnTo, resetPreferenceCookies(effectiveRequestUrl(request).protocol === "https:"));
}

function redirectWithCookies(request: Request, returnTo: string, cookies: string[]): Response {
  const requestUrl = effectiveRequestUrl(request);
  const target = new URL(returnTo, requestUrl);
  const location = target.origin === requestUrl.origin ? target.toString() : new URL("/settings", requestUrl).toString();
  const headers = new Headers({
    location,
    "cache-control": "no-store",
    vary: "Cookie",
  });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

export function settingsHtml(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'self'; img-src 'self' data:; media-src 'self' blob: https://video.twimg.com; script-src 'self' 'unsafe-hashes' 'sha256-/Z4pjjEaN4JuXiqMBajQpiZZINsH7QgIOYHQmRoj740='; worker-src 'self' blob:; connect-src 'self' https://video.twimg.com; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      vary: "Cookie",
    },
  });
}
