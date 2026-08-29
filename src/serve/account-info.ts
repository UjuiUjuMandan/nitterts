import { fetchAccountInfo } from "../x/client";
import type { AccountInfo } from "../x/profile";
import { withCookieSession } from "../x/sessions";

export async function fetchOptionalAccountInfo(
  sessions: string,
  username: string,
): Promise<AccountInfo | undefined> {
  try {
    return await withCookieSession(sessions, (session) => fetchAccountInfo(username, session));
  } catch (error) {
    console.warn(JSON.stringify({
      message: "account info fetch failed",
      username,
      error: error instanceof Error ? error.message : String(error),
    }));
    return undefined;
  }
}
