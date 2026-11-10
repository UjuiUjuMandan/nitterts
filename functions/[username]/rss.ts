import { renderErrorPage, requestPath } from "../../src/render/profile";
import { renderTimelineRss } from "../../src/render/rss";
import { loadSessionPool } from "../../src/session-pool";
import { fetchProfile, XApiError } from "../../src/x/client";
import { ProfileNotFoundError } from "../../src/x/profile";
import { AllSessionsLimitedError, withCookieSession } from "../../src/x/sessions";
import { fetchProfileTimeline } from "../../src/x/timeline";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const username = context.params.username;
  if (typeof username !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    return new Response(renderErrorPage("Invalid username", 400, requestPath(context.request)), {
      status: 400,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  try {
    const { profile, timeline } = await withCookieSession(
      await loadSessionPool(context.env, context.request),
      async (session) => {
        const profile = await fetchProfile(username, session);
        if (profile.suspended || profile.protected) return { profile, timeline: { tweets: [] } };
        const timeline = await fetchProfileTimeline("tweets", profile.id, session);
        return { profile, timeline };
      },
    );
    const origin = new URL(context.request.url).origin;
    const headers: Record<string, string> = {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=600",
    };
    const newest = timeline.tweets[0]?.id;
    if (newest) headers["min-id"] = newest;
    return new Response(renderTimelineRss(profile, timeline, origin), { status: 200, headers });
  } catch (error) {
    const notFound = error instanceof ProfileNotFoundError;
    const status = notFound ? 404 : error instanceof XApiError ? 502 : error instanceof AllSessionsLimitedError ? 503 : 500;
    console.error(
      JSON.stringify({
        message: "rss request failed",
        username,
        upstreamStatus: error instanceof XApiError ? error.status : undefined,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    const headers: Record<string, string> = { "content-type": "text/html; charset=utf-8" };
    if (error instanceof AllSessionsLimitedError) headers["retry-after"] = String(error.retryAfterSeconds);
    return new Response(renderErrorPage(notFound ? "User not found" : "Unable to load feed", status, requestPath(context.request)), {
      status,
      headers,
    });
  }
};
