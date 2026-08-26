import { renderErrorPage, renderProfilePage } from "../src/render/profile";
import { fetchProfile, XApiError } from "../src/x/client";
import { ProfileNotFoundError } from "../src/x/profile";
import { withCookieSession } from "../src/x/sessions";
import { fetchTimeline } from "../src/x/timeline";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const username = context.params.username;
  if (typeof username !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    return html(renderErrorPage("Invalid username", 400), 400);
  }

  const cursor = new URL(context.request.url).searchParams.get("cursor") ?? undefined;
  try {
    const { profile, timeline } = await withCookieSession(
      context.env.NITTER_SESSIONS,
      async (session) => {
        const fetchedProfile = await fetchProfile(username, session);
        const profile = fetchedProfile.suspended
          ? { ...fetchedProfile, username, name: username }
          : fetchedProfile;
        const timeline = profile.protected || profile.suspended
          ? { tweets: [] }
          : await fetchTimeline(profile.id, session, cursor);
        return { profile, timeline };
      },
    );
    return html(renderProfilePage(profile, timeline), 200);
  } catch (error) {
    const notFound = error instanceof ProfileNotFoundError;
    const status = notFound ? 404 : error instanceof XApiError ? 502 : 500;
    console.error(
      JSON.stringify({
        message: "profile page request failed",
        username,
        upstreamStatus: error instanceof XApiError ? error.status : undefined,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return html(renderErrorPage(notFound ? "User not found" : "Unable to load profile", status), status);
  }
};

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
