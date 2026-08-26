import { parseSessions } from "../../../src/session";
import { fetchProfile, XApiError } from "../../../src/x/client";
import { ProfileNotFoundError } from "../../../src/x/profile";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const username = context.params.username;
  if (typeof username !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    return Response.json({ error: "Invalid username" }, { status: 400 });
  }

  try {
    const sessions = parseSessions(context.env.NITTER_SESSIONS);
    let profile: Awaited<ReturnType<typeof fetchProfile>> | undefined;
    let lastError: unknown;
    for (const session of sessions) {
      try {
        profile = await fetchProfile(username, session);
        break;
      } catch (error) {
        lastError = error;
        if (!(error instanceof XApiError) || ![401, 403, 429].includes(error.status)) {
          throw error;
        }
      }
    }
    if (!profile) throw lastError ?? new Error("No cookie sessions configured");

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
