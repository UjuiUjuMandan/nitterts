import { parseSessions } from "../session";
import { XApiError } from "./client";

const RETRYABLE_SESSION_STATUSES = new Set([401, 403, 429]);

export async function withCookieSession<T>(
  jsonl: string,
  action: (session: ReturnType<typeof parseSessions>[number]) => Promise<T>,
): Promise<T> {
  const sessions = parseSessions(jsonl);
  let lastError: unknown;

  for (const session of sessions) {
    try {
      return await action(session);
    } catch (error) {
      lastError = error;
      if (!(error instanceof XApiError) || !RETRYABLE_SESSION_STATUSES.has(error.status)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("No cookie sessions configured");
}
