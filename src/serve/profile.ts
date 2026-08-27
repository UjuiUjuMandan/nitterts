import { renderErrorPage, renderProfilePage } from "../render/profile";
import { fetchProfile, XApiError } from "../x/client";
import { ProfileNotFoundError } from "../x/profile";
import { withCookieSession } from "../x/sessions";
import { fetchProfileTimeline, photoRail, type ProfileTab } from "../x/timeline";
import { fetchOptionalBasedIn } from "./account-info";

export async function serveProfilePage(
  request: Request,
  env: Env,
  username: string,
  tab: ProfileTab,
): Promise<Response> {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    return html(renderErrorPage("Invalid username", 400), 400);
  }

  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  try {
    const { profile, timeline, photos } = await withCookieSession(
      env.NITTER_SESSIONS,
      async (session) => {
        const fetchedProfile = await fetchProfile(username, session);
        const profile = fetchedProfile.suspended
          ? { ...fetchedProfile, username, name: username }
          : fetchedProfile;
        if (profile.protected || profile.suspended) {
          return { profile, timeline: { tweets: [] }, photos: [] };
        }
        const timeline = await fetchProfileTimeline(tab, profile.id, session, cursor);
        let photos: Awaited<ReturnType<typeof photoRail>> = [];
        if (tab === "tweets" && !cursor) {
          try {
            photos = photoRail(await fetchProfileTimeline("media", profile.id, session));
          } catch (error) {
            console.warn(
              JSON.stringify({
                message: "photo rail fetch failed",
                username,
                error: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        }
        return { profile, timeline, photos };
      },
    );
    const basedIn = profile.suspended ? "" : await fetchOptionalBasedIn(env.NITTER_SESSIONS, username);
    return html(renderProfilePage({ ...profile, basedIn }, timeline, tab, photos), 200);
  } catch (error) {
    const notFound = error instanceof ProfileNotFoundError;
    const status = notFound ? 404 : error instanceof XApiError ? 502 : 500;
    console.error(
      JSON.stringify({
        message: "profile page request failed",
        username,
        tab,
        upstreamStatus: error instanceof XApiError ? error.status : undefined,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return html(renderErrorPage(notFound ? "User not found" : "Unable to load profile", status), status);
  }
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
