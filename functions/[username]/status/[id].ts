import { renderErrorPage, requestPath } from "../../../src/render/profile";
import { renderStatusPage } from "../../../src/render/status";
import { preferencesFromRequest } from "../../../src/preferences";
import { loadSessionPool } from "../../../src/session-pool";
import { fetchConversation, parseReplySort, TweetNotFoundError } from "../../../src/x/conversation";
import { XApiError } from "../../../src/x/client";
import { AllSessionsLimitedError, withCookieSession } from "../../../src/x/sessions";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const preferences = preferencesFromRequest(context.request);
  const username = context.params.username;
  const id = context.params.id;
  const params = new URL(context.request.url).searchParams;
  const cursor = params.get("cursor") ?? undefined;
  const sort = parseReplySort(params.get("sort"));
  if (
    typeof username !== "string" ||
    !/^[A-Za-z0-9_]{1,15}$/.test(username) ||
    typeof id !== "string" ||
    !/^\d{1,19}$/.test(id)
  ) {
    return html(renderErrorPage("Invalid post URL", 400, requestPath(context.request)), 400);
  }

  try {
    const conversation = await withCookieSession(await loadSessionPool(context.env, context.request), (session) =>
      fetchConversation(id, session, cursor, sort),
    );
    return html(renderStatusPage(conversation, preferences, cursor, sort), 200);
  } catch (error) {
    const notFound = error instanceof TweetNotFoundError;
    const status = notFound ? 404 : error instanceof XApiError ? 502 : error instanceof AllSessionsLimitedError ? 503 : 500;
    console.error(
      JSON.stringify({
        message: "status page request failed",
        username,
        id,
        upstreamStatus: error instanceof XApiError ? error.status : undefined,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return html(renderErrorPage(notFound ? "Post not found" : "Unable to load post", status, requestPath(context.request)), status, retryAfter(error));
  }
};

function retryAfter(error: unknown): Record<string, string> | undefined {
  return error instanceof AllSessionsLimitedError ? { "retry-after": String(error.retryAfterSeconds) } : undefined;
}

function html(body: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'self'; img-src 'self' data: https://pbs.twimg.com https://abs.twimg.com https://video.twimg.com; media-src 'self' blob: https://video.twimg.com; script-src 'self' 'unsafe-hashes' 'sha256-/Z4pjjEaN4JuXiqMBajQpiZZINsH7QgIOYHQmRoj740='; worker-src 'self' blob:; connect-src 'self' https://video.twimg.com; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      vary: "Cookie",
      ...headers,
    },
  });
}
