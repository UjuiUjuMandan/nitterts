import { renderListPage } from "../render/list";
import { renderErrorPage } from "../render/profile";
import { renderListRss } from "../render/rss";
import { preferencesFromRequest } from "../preferences";
import { XApiError } from "../x/client";
import { fetchListById, fetchListBySlug, fetchListMembers, fetchListTimeline, ListNotFoundError } from "../x/list";
import { withCookieSession } from "../x/sessions";

export async function serveListPage(
  request: Request,
  env: Env,
  id: string,
  tab: "tweets" | "members",
): Promise<Response> {
  const preferences = preferencesFromRequest(request);
  if (!/^\d{1,20}$/.test(id)) return html(renderErrorPage("Invalid list ID", 400), 400);
  const cursor = new URL(request.url).searchParams.get("cursor") || undefined;
  try {
    if (tab === "members") {
      const { list, members } = await withCookieSession(env.NITTER_SESSIONS, async (session) => {
        const [list, members] = await Promise.all([
          fetchListById(id, session),
          fetchListMembers(id, session, cursor),
        ]);
        return { list, members };
      });
      return html(renderListPage(list, tab, undefined, members, preferences, cursor), 200);
    }
    const { list, timeline } = await withCookieSession(env.NITTER_SESSIONS, async (session) => {
      const [list, timeline] = await Promise.all([
        fetchListById(id, session),
        fetchListTimeline(id, session, cursor),
      ]);
      return { list, timeline };
    });
    return html(renderListPage(list, tab, timeline, undefined, preferences, cursor), 200);
  } catch (error) {
    return listError(error, { id, tab });
  }
}

export async function serveListSlugRedirect(request: Request, env: Env, username: string, slug: string): Promise<Response> {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(username) || username.toLowerCase() === "i" || !slug || slug.length > 100) {
    return html(renderErrorPage("Invalid list", 400), 400);
  }
  try {
    const list = await withCookieSession(env.NITTER_SESSIONS, (session) => fetchListBySlug(username, slug, session));
    const target = new URL(`/i/lists/${encodeURIComponent(list.id)}`, request.url);
    const cursor = new URL(request.url).searchParams.get("cursor");
    if (cursor) target.searchParams.set("cursor", cursor);
    return Response.redirect(target.toString(), 302);
  } catch (error) {
    return listError(error, { username, slug });
  }
}

export async function serveListRss(request: Request, env: Env, id: string): Promise<Response> {
  if (!/^\d{1,20}$/.test(id)) return html(renderErrorPage("Invalid list ID", 400), 400);
  try {
    const { list, timeline } = await withCookieSession(env.NITTER_SESSIONS, async (session) => {
      const [list, timeline] = await Promise.all([
        fetchListById(id, session),
        fetchListTimeline(id, session),
      ]);
      return { list, timeline };
    });
    const headers: Record<string, string> = {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=600",
    };
    if (timeline.tweets[0]?.id) headers["min-id"] = timeline.tweets[0].id;
    return new Response(renderListRss(list, timeline, new URL(request.url).origin), { status: 200, headers });
  } catch (error) {
    return listError(error, { id, kind: "rss" });
  }
}

export async function serveListSlugRssRedirect(request: Request, env: Env, username: string, slug: string): Promise<Response> {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(username) || username.toLowerCase() === "i" || !slug || slug.length > 100) {
    return html(renderErrorPage("Invalid list", 400), 400);
  }
  try {
    const list = await withCookieSession(env.NITTER_SESSIONS, (session) => fetchListBySlug(username, slug, session));
    const target = new URL(`/i/lists/${encodeURIComponent(list.id)}/rss`, request.url);
    const cursor = new URL(request.url).searchParams.get("cursor");
    if (cursor) target.searchParams.set("cursor", cursor);
    return Response.redirect(target.toString(), 302);
  } catch (error) {
    return listError(error, { username, slug, kind: "rss" });
  }
}

function listError(error: unknown, details: Record<string, string>): Response {
  const notFound = error instanceof ListNotFoundError;
  const status = notFound ? 404 : error instanceof XApiError ? 502 : 500;
  console.error(JSON.stringify({
    message: "list request failed",
    ...details,
    upstreamStatus: error instanceof XApiError ? error.status : undefined,
    error: error instanceof Error ? error.message : String(error),
  }));
  return html(renderErrorPage(notFound ? "List not found" : "Unable to load list", status), status);
}

function html(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; form-action 'self'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      vary: "Cookie",
    },
  });
}
