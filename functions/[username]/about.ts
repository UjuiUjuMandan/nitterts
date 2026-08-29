import { renderAboutPage } from "../../src/render/about";
import { renderErrorPage } from "../../src/render/profile";
import { preferencesFromRequest } from "../../src/preferences";
import { fetchOptionalAccountInfo } from "../../src/serve/account-info";
import { fetchProfile, XApiError } from "../../src/x/client";
import { ProfileNotFoundError } from "../../src/x/profile";
import { withCookieSession } from "../../src/x/sessions";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const preferences = preferencesFromRequest(context.request);
  const username = context.params.username;
  if (typeof username !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    return html(renderErrorPage("Invalid username", 400), 400);
  }
  try {
    const profile = await withCookieSession(context.env.NITTER_SESSIONS, async (session) => {
      const value = await fetchProfile(username, session);
      return { ...value, username: value.username || username, name: value.name || username };
    });
    const accountInfo = profile.suspended ? undefined : await fetchOptionalAccountInfo(context.env.NITTER_SESSIONS, username);
    return html(renderAboutPage({ ...profile, basedIn: accountInfo?.basedIn ?? "" }, preferences, accountInfo), 200);
  } catch (error) {
    const notFound = error instanceof ProfileNotFoundError;
    const status = notFound ? 404 : error instanceof XApiError ? 502 : 500;
    console.error(JSON.stringify({ message: "about account request failed", username, upstreamStatus: error instanceof XApiError ? error.status : undefined, error: error instanceof Error ? error.message : String(error) }));
    return html(renderErrorPage(notFound ? "User not found" : "Unable to load account details", status), status);
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
