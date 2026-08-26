import { renderErrorPage, renderProfilePage } from "../render/profile";
import { fetchProfile, XApiError } from "../x/client";
import { ProfileNotFoundError } from "../x/profile";
import { withCookieSession } from "../x/sessions";
import { fetchProfileTimeline, type ProfileTab } from "../x/timeline";

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
    const { profile, timeline } = await withCookieSession(
      env.NITTER_SESSIONS,
      async (session) => {
        const fetchedProfile = await fetchProfile(username, session);
        const profile = fetchedProfile.suspended
          ? { ...fetchedProfile, username, name: username }
          : fetchedProfile;
        const timeline = profile.protected || profile.suspended
          ? { tweets: [] }
          : await fetchProfileTimeline(tab, profile.id, session, cursor);
        return { profile, timeline };
      },
    );
    return html(renderProfilePage(profile, timeline, tab), 200);
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
