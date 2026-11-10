import type { CookieSession } from "../session";
import { fetchAccountInfo } from "../x/client";
import type { AccountInfo } from "../x/profile";
import { withCookieSession } from "../x/sessions";

export async function fetchOptionalAccountInfo(
  sessions: CookieSession[],
  username: string,
  request: Request,
  fetchOnMiss = false,
): Promise<AccountInfo | undefined> {
  // Normal profile/search views only read cached public metadata. Visiting
  // /about opts into fetching it; never cache cookies or session identifiers.
  const cache = typeof caches === "undefined" ? undefined : caches.default;
  const key = new Request(new URL(`/__nitterts_cache/account-info/v1/${encodeURIComponent(username.toLowerCase())}`, request.url));
  try {
    const cached = await cache?.match(key);
    if (cached) return await cached.json<AccountInfo>();
  } catch {
    // Cache availability must not break profiles or account details.
  }
  if (!fetchOnMiss) return undefined;

  try {
    const info = await withCookieSession(sessions, (session) => fetchAccountInfo(username, session));
    if (!info.username) return undefined;
    try {
      await cache?.put(key, Response.json(info, { headers: { "cache-control": "public, max-age=86400" } }));
    } catch {
      // Return freshly fetched details even if the cache cannot persist them.
    }
    return info;
  } catch (error) {
    console.warn(JSON.stringify({
      message: "account info fetch failed",
      username,
      error: error instanceof Error ? error.message : String(error),
    }));
    return undefined;
  }
}
