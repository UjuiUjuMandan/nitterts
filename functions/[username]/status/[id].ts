import { renderErrorPage } from "../../../src/render/profile";
import { renderStatusPage } from "../../../src/render/status";
import { preferencesFromRequest } from "../../../src/preferences";
import { fetchConversation, TweetNotFoundError } from "../../../src/x/conversation";
import { XApiError } from "../../../src/x/client";
import { withCookieSession } from "../../../src/x/sessions";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const preferences = preferencesFromRequest(context.request);
  const username = context.params.username;
  const id = context.params.id;
  if (
    typeof username !== "string" ||
    !/^[A-Za-z0-9_]{1,15}$/.test(username) ||
    typeof id !== "string" ||
    !/^\d{1,19}$/.test(id)
  ) {
    return html(renderErrorPage("Invalid post URL", 400), 400);
  }

  try {
    const conversation = await withCookieSession(context.env.NITTER_SESSIONS, (session) =>
      fetchConversation(id, session),
    );
    return html(renderStatusPage(conversation, preferences), 200);
  } catch (error) {
    const notFound = error instanceof TweetNotFoundError;
    const status = notFound ? 404 : error instanceof XApiError ? 502 : 500;
    console.error(
      JSON.stringify({
        message: "status page request failed",
        username,
        id,
        upstreamStatus: error instanceof XApiError ? error.status : undefined,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return html(renderErrorPage(notFound ? "Post not found" : "Unable to load post", status), status);
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
      "cache-control": "private, no-store",
      vary: "Cookie",
    },
  });
}
