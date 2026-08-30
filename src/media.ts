import { createHmac } from "node:crypto";

const ALLOWED_MEDIA_HOSTS = new Set([
  "abs.twimg.com",
  "pbs.twimg.com",
  "video.twimg.com",
]);

// Mirrors upstream Nitter's hmacKey: video proxy URLs are signed so the
// proxy only serves URLs this instance rendered, preventing third parties
// from relaying arbitrary twimg content through us.
let hmacKey: string | undefined;
let warnedUnsigned = false;

export function installMediaSigner(key: string | undefined): void {
  hmacKey = key && key.length > 0 ? key : undefined;
  if (!hmacKey && !warnedUnsigned) {
    warnedUnsigned = true;
    console.warn(JSON.stringify({ message: "NITTER_HMAC_KEY is not set; video proxy URLs are unsigned" }));
  }
}

export function resetMediaSigner(): void {
  hmacKey = undefined;
  warnedUnsigned = false;
}

export function mediaSignature(url: string): string {
  return createHmac("sha256", hmacKey ?? "").update(url).digest("hex").slice(0, 13);
}

export function verifyMediaSignature(url: string, signature: string | null): boolean {
  if (!hmacKey) return true;
  if (!signature || signature.length !== 13) return false;
  return fixedTimeEqual(mediaSignature(url), signature);
}

function fixedTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < a.length && i < b.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function isAllowedMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_MEDIA_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

// Upstream stores tweet photo URLs relative (media/xxx.png) and keeps full
// URLs for banners and avatars; replicate both /pic forms.
const PBS_PREFIX = "https://pbs.twimg.com/";

// Media links: /pic/<encoded>. Tweet photos use the shortened relative form.
export function picUrl(value: string): string {
  if (value.startsWith(PBS_PREFIX + "media/")) {
    return `/pic/${encodeURIComponent(value.slice(PBS_PREFIX.length))}`;
  }
  return `/pic/${encodeURIComponent(value)}`;
}

// Original-size links: /pic/orig/<encoded>; the route appends name=orig.
export function origPicUrl(value: string): string {
  const stripped = value.startsWith(PBS_PREFIX + "media/") ? value.slice(PBS_PREFIX.length) : value;
  return `/pic/orig/${encodeURIComponent(stripped)}`;
}

// Video and manifest links: /video/<sig>/<encoded url>.
export function videoUrl(value: string): string {
  return `/video/${mediaSignature(value)}/${encodeURIComponent(value)}`;
}

export function mediaProxyUrl(value: string): string {
  try {
    const host = new URL(value).hostname;
    if (host === "video.twimg.com") return videoUrl(value);
    if (host === "pbs.twimg.com" || host === "abs.twimg.com") return picUrl(value);
  } catch {
    // fall through to the pic form for non-URL values
  }
  return picUrl(value);
}

// Restores the URL a /pic or /pic/orig path segment encodes. Mirrors
// upstream normalizeImgUrl: relative paths imply pbs.twimg.com.
export function normalizePicUrl(value: string): string {
  let url = value;
  if (!url.startsWith("http")) {
    if (!url.includes("twimg.com")) url = `pbs.twimg.com/${url}`;
    url = `https://${url}`;
  }
  return url;
}

export function rewriteVideoManifest(manifest: string, manifestUrl: string): string {
  const proxy = (value: string): string => {
    try {
      const resolved = new URL(value, manifestUrl).toString();
      if (!isAllowedMediaUrl(resolved)) return value;
      const host = new URL(resolved).hostname;
      return host === "video.twimg.com" ? videoUrl(resolved) : picUrl(resolved);
    } catch {
      return value;
    }
  };

  return manifest.split("\n").map((line) => {
    if (!line || line.startsWith("#")) {
      return line.replace(/URI="([^"]+)"/g, (_match, url: string) => `URI="${proxy(url)}"`);
    }
    return proxy(line.trim());
  }).join("\n");
}
