import { renderErrorPage } from "../render/profile";
import { renderSearchPage } from "../render/search";
import { fetchProfile, XApiError } from "../x/client";
import { ProfileNotFoundError } from "../x/profile";
import { withCookieSession } from "../x/sessions";
import { filterSearchTimeline, fetchProfileTimeline, fetchSearchTimeline, photoRail, type SearchKind } from "../x/timeline";
import { fetchOptionalBasedIn } from "./account-info";

export async function serveSearchPage(request: Request, env: Env, username?: string): Promise<Response> {
  if (username && !/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    return html(renderErrorPage("Invalid username", 400), 400);
  }
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (query.length > 500) return html(renderErrorPage("Search input too long", 400), 400);
  const requestedKind = url.searchParams.get("f");
  const kind: SearchKind = requestedKind === "top" || requestedKind === "media" ? requestedKind : "tweets";
  const cursor = url.searchParams.get("cursor") || undefined;
  const since = validDate(url.searchParams.get("since"));
  const until = validDate(url.searchParams.get("until"));
  const minLikes = validNumber(url.searchParams.get("min_faves"));
  const search = { query, kind, cursor, username, since, until, minLikes };
  if (!query && !username && !since && !until && !minLikes) {
    return html(renderSearchPage(search), 200);
  }

  try {
    const result = await withCookieSession(env.NITTER_SESSIONS, async (session) => {
      const rawQuery = [
        username ? `from:${username}` : "",
        query,
        "include:nativeretweets",
        since ? `since:${since}` : "",
        until ? `until:${until}` : "",
        minLikes ? `min_faves:${minLikes}` : "",
      ].filter(Boolean).join(" ");
      if (!username) {
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
        await fetchSearchTimeline(rawQuery, kind, session, cursor),
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
      ? await fetchOptionalBasedIn(env.NITTER_SESSIONS, username ?? result.profile.username)
      : "";
    const profile = result.profile ? { ...result.profile, basedIn } : undefined;
    return html(renderSearchPage(search, result.timeline, profile, result.photos), 200);
  } catch (error) {
    const notFound = error instanceof ProfileNotFoundError;
    const status = notFound ? 404 : error instanceof XApiError ? 502 : 500;
    console.error(JSON.stringify({ message: "search request failed", username, query, kind, upstreamStatus: error instanceof XApiError ? error.status : undefined, error: error instanceof Error ? error.message : String(error) }));
    return html(renderErrorPage(notFound ? "User not found" : "Unable to search", status), status);
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
      "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; form-action 'self'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}
