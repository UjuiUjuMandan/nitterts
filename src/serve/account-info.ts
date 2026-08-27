import { fetchProfileBasedIn } from "../x/client";
import { withCookieSession } from "../x/sessions";

export async function fetchOptionalBasedIn(
  sessions: string,
  username: string,
): Promise<string> {
  try {
    return await withCookieSession(sessions, (session) => fetchProfileBasedIn(username, session));
  } catch (error) {
    console.warn(JSON.stringify({
      message: "account info fetch failed",
      username,
      error: error instanceof Error ? error.message : String(error),
    }));
    return "";
  }
}
