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

export function rewriteVideoManifest(manifest: string, manifestUrl: string): string {
  const proxy = (value: string): string => {
    try {
      const resolved = new URL(value, manifestUrl).toString();
      return isAllowedMediaUrl(resolved) ? mediaProxyUrl(resolved) : value;
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
