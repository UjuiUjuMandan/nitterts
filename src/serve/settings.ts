import { clearPreferencesCookie, GALLERY_SIZES, MEDIA_VIEWS, PREFERENCE_KEYS, preferencesCookie, preferencesFromRequest, type PagePreferences } from "../preferences";
import { renderSettingsPage } from "../render/settings";

const MAX_BODY_BYTES = 8 * 1024;

// Cloudflare terminates TLS at its edge before the worker, so request.url can
// arrive as http:// while the browser-originated Origin header is https://.
// The edge overwrites x-forwarded-proto, so trusting it cannot be spoofed;
// take the last element because overwrite-style proxies emit a single value
// while append-style chains put the client-supplied value first.
function effectiveRequestUrl(request: Request): URL {
  const url = new URL(request.url);
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",").pop()?.trim().toLowerCase();
  if (forwarded === "https" || forwarded === "http") url.protocol = `${forwarded}:`;
  return url;
}

export function serveSettingsPage(request: Request): Response {
  const url = effectiveRequestUrl(request);
  const returnTo = safeReturnTo(url.searchParams.get("referer"), url) ?? "/settings";
  return settingsHtml(renderSettingsPage(preferencesFromRequest(request), returnTo));
}

export async function serveSavePreferences(request: Request): Promise<Response> {
  const rejected = validateMutation(request);
  if (rejected) return rejected;
  const params = await readForm(request);
  if (params instanceof Response) return params;
  const allowed = new Set<string>([...PREFERENCE_KEYS, "mediaView", "gallerySize", "returnTo", "referer"]);
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
  if (!mediaView || !gallerySize) return new Response("Invalid preference value", { status: 400 });
  const preferences = { ...Object.fromEntries(entries), mediaView, gallerySize } as PagePreferences;
  const returnTo = safeReturnTo(params.get("returnTo") ?? params.get("referer"), effectiveRequestUrl(request)) ?? "/settings";
  return redirectWithCookie(request, returnTo, preferencesCookie(preferences, effectiveRequestUrl(request).protocol === "https:"));
}

function normalizedChoice<T extends string>(value: string, choices: readonly T[]): T | undefined {
  const normalized = value.toLowerCase();
  return choices.find((choice) => choice === normalized);
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
  return redirectWithCookie(request, returnTo, clearPreferencesCookie(effectiveRequestUrl(request).protocol === "https:"));
}

function validateMutation(request: Request): Response | undefined {
  const url = effectiveRequestUrl(request);
  // Browsers force-set Sec-Fetch-Site and page JS cannot forge it. Some
  // privacy extensions and sandboxed contexts send Origin: null; those are
  // accepted only when the browser still reports the request as same-origin.
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const sameOrigin = origin === url.origin
    || ((origin === null || origin === "null") && fetchSite === "same-origin");
  if (!sameOrigin || fetchSite === "cross-site") {
    return new Response("Cross-site preference update rejected", { status: 403 });
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return new Response("Unsupported content type", { status: 415 });
  }
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return new Response("Request body too large", { status: 413 });
  return undefined;
}

async function readForm(request: Request): Promise<URLSearchParams | Response> {
  if (!request.body) return new URLSearchParams();
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_BODY_BYTES) return new Response("Request body too large", { status: 413 });
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return new URLSearchParams(body);
  } finally {
    await reader.cancel();
  }
}

function redirectWithCookie(request: Request, returnTo: string, cookie: string): Response {
  const requestUrl = effectiveRequestUrl(request);
  const target = new URL(returnTo, requestUrl);
  const location = target.origin === requestUrl.origin ? target.toString() : new URL("/settings", requestUrl).toString();
  return new Response(null, {
    status: 303,
    headers: {
      location,
      "set-cookie": cookie,
      "cache-control": "no-store",
      vary: "Cookie",
    },
  });
}

function safeReturnTo(value: string | null, requestUrl: URL): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return undefined;
  try {
    const target = new URL(value, requestUrl);
    return target.origin === requestUrl.origin ? `${target.pathname}${target.search}${target.hash}` : undefined;
  } catch {
    return undefined;
  }
}

function settingsHtml(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      vary: "Cookie",
    },
  });
}
