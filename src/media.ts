const ALLOWED_MEDIA_HOSTS = new Set([
  "abs.twimg.com",
  "pbs.twimg.com",
  "video.twimg.com",
]);

export function isAllowedMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_MEDIA_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export function mediaProxyUrl(value: string): string {
  return `/media?url=${encodeURIComponent(value)}`;
}
