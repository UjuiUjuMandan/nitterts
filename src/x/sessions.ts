import type { CookieSession } from "../session";
import { XApiError } from "./client";

const RETRYABLE_SESSION_STATUSES = new Set([401, 403, 429]);

// Runs an action against the pool in order; a 401/403/429 from X moves on to
// the next session, anything else aborts. The pool comes from
// loadSessionPool (operator secret + visitor donations).
export async function withCookieSession<T>(
  sessions: CookieSession[],
  action: (session: CookieSession) => Promise<T>,
): Promise<T> {
  if (sessions.length === 0) {
    throw new Error("No cookie sessions configured");
  }

  let lastError: unknown;

  for (const session of sessions) {
    try {
      return await action(session);
    } catch (error) {
      lastError = error;
      if (!isRetryableSessionError(error)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("No cookie sessions configured");
}

export function isRetryableSessionError(error: unknown): error is XApiError {
  return error instanceof XApiError && RETRYABLE_SESSION_STATUSES.has(error.status);
}
