import { renderErrorPage, requestPath } from "../render/profile";
import { renderSearchPage, xSearchUrl } from "../render/search";
import { preferencesFromRequest } from "../preferences";
import { fetchProfile, XApiError } from "../x/client";
import { ProfileNotFoundError, type Profile } from "../x/profile";
import { withCookieSession } from "../x/sessions";
import {
  filterSearchTimeline,
  fetchListSearch,
  fetchProfileTimeline,
  fetchSearchTimeline,
  fetchUserSearch,
  photoRail,
  type PhotoRailItem,
  type SearchKind,
  type SearchResults,
  type TweetSearchKind,
} from "../x/timeline";
import { fetchOptionalAccountInfo } from "./account-info";

export async function serveSearchPage(request: Request, env: Env, username?: string): Promise<Response> {
  const preferences = preferencesFromRequest(request);
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const requestedKind = url.searchParams.get("f");
  const globalKind: SearchKind = requestedKind === "top" || requestedKind === "media"
    || requestedKind === "users" || requestedKind === "user"
    || requestedKind === "lists" || requestedKind === "list"
    ? requestedKind === "user" ? "users" : requestedKind === "list" ? "lists" : requestedKind
    : "tweets";
  const kind: SearchKind = username && (globalKind === "users" || globalKind === "lists") ? "tweets" : globalKind;
  const cursor = url.searchParams.get("cursor") || undefined;
  const since = validDate(url.searchParams.get("since"));
  const until = validDate(url.searchParams.get("until"));
  const minLikes = validNumber(url.searchParams.get("min_faves"));
  const search = { query, kind, cursor, username, since, until, minLikes };
  if (username && !/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    return html(renderErrorPage("Invalid username", 400, requestPath(request), xSearchUrl(search)), 400);
  }
  if (query.length > 500) return html(renderErrorPage("Search input too long", 400, requestPath(request), xSearchUrl(search)), 400);
  if (!query && ((kind === "users" || kind === "lists") || (!username && !since && !until && !minLikes))) {
    return html(renderSearchPage(search, undefined, undefined, [], preferences), 200);
  }

  try {
    const result = await withCookieSession<SearchResults & { profile?: Profile; photos?: PhotoRailItem[] }>(env.NITTER_SESSIONS, async (session) => {
      const rawQuery = [
        username ? `from:${username}` : "",
        query,
        "include:nativeretweets",
        since ? `since:${since}` : "",
        until ? `until:${until}` : "",
        minLikes ? `min_faves:${minLikes}` : "",
      ].filter(Boolean).join(" ");
      if (!username) {
        if (kind === "users") return await fetchUserSearch(query, session, cursor);
        if (kind === "lists") return await fetchListSearch(query, session, cursor);
        return { timeline: await fetchSearchTimeline(rawQuery, kind, session, cursor) };
      }
      const fetchedProfile = await fetchProfile(username, session);
      const profile = fetchedProfile.suspended
        ? { ...fetchedProfile, username, name: username }
        : fetchedProfile;
      if (profile.protected || profile.suspended) {
        return { timeline: { tweets: [] }, profile, photos: [] };
      }
      const timeline = filterSearchTimeline(
        await fetchSearchTimeline(rawQuery, kind as TweetSearchKind, session, cursor),
        username,
      );
      let photos: ReturnType<typeof photoRail> = [];
      if (!cursor) {
        try {
          photos = photoRail(await fetchProfileTimeline("media", profile.id, session));
        } catch (error) {
          console.warn(JSON.stringify({ message: "search photo rail fetch failed", username, error: error instanceof Error ? error.message : String(error) }));
        }
      }
      return { timeline, profile, photos };
    });
    const basedIn = result.profile && !result.profile.suspended
      ? (await fetchOptionalAccountInfo(env.NITTER_SESSIONS, username ?? result.profile.username))?.basedIn ?? ""
      : "";
    const profile = result.profile ? { ...result.profile, basedIn } : undefined;
    return html(renderSearchPage(search, result, profile, result.photos, preferences), 200);
  } catch (error) {
    const notFound = error instanceof ProfileNotFoundError;
    const status = notFound ? 404 : error instanceof XApiError ? 502 : 500;
    console.error(JSON.stringify({ message: "search request failed", username, query, kind, upstreamStatus: error instanceof XApiError ? error.status : undefined, error: error instanceof Error ? error.message : String(error) }));
    return html(renderErrorPage(notFound ? "User not found" : "Unable to search", status, requestPath(request), xSearchUrl(search)), status);
  }
}

function validDate(value: string | null): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
    ? value
    : undefined;
}

function validNumber(value: string | null): string | undefined {
  if (!value || !/^\d{1,10}$/.test(value)) return undefined;
  const number = Number(value);
  return Number.isSafeInteger(number) && number <= 2_147_483_647 ? String(number) : undefined;
}

function html(body: string, status: number): Response {
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
