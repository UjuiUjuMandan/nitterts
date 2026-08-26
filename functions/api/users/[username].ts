import { fetchProfile, XApiError } from "../../../src/x/client";
import { ProfileNotFoundError } from "../../../src/x/profile";
import { withCookieSession } from "../../../src/x/sessions";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const username = context.params.username;
  if (typeof username !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    return Response.json({ error: "Invalid username" }, { status: 400 });
  }

  try {
    const profile = await withCookieSession(context.env.NITTER_SESSIONS, (session) =>
      fetchProfile(username, session),
    );

    return Response.json(profile, {
      headers: { "cache-control": "public, max-age=60" },
    });
  } catch (error) {
    const notFound = error instanceof ProfileNotFoundError;
    const upstreamStatus = error instanceof XApiError ? error.status : undefined;
    console.error(
      JSON.stringify({
        message: "profile request failed",
        username,
        upstreamStatus,
        error: error instanceof Error ? error.message : String(error),
      }),
    );

    return Response.json(
      {
        error: notFound
          ? "Profile not found"
          : upstreamStatus
            ? "X API request failed"
            : "Internal server error",
      },
      { status: notFound || upstreamStatus === 404 ? 404 : upstreamStatus ? 502 : 500 },
    );
  }
};
