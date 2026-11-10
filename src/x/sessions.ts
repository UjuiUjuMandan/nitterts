import type { CookieSession } from "../session";
import { XApiError } from "./client";
import { metricsSink } from "./metrics-sink";
import { localLimitedResets } from "./rate-limit";

const RETRYABLE_SESSION_STATUSES = new Set([401, 403, 429]);

// Thrown when every session in the pool is currently rate-limited. Carries
// the seconds until the earliest window resets so routes can answer with
// 503 + Retry-After instead of a misleading 502.
export class AllSessionsLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`All cookie sessions are rate-limited; retry in ${retryAfterSeconds}s`);
    this.name = "AllSessionsLimitedError";
  }
}

export async function withCookieSession<T>(
  sessions: CookieSession[],
  action: (session: CookieSession) => Promise<T>,
): Promise<T> {
  if (sessions.length === 0) {
    throw new Error("No cookie sessions configured");
  }

  // Sessions with a live 429 window go last, so limited cookies stop
  // absorbing first-contact retries. Rate-limit data is best effort: without
  // it the order simply stays as given.
  const now = Math.floor(Date.now() / 1000);
  const resets = await limitedResets(sessions);
  const fresh: CookieSession[] = [];
  const limited: CookieSession[] = [];
  for (const session of sessions) {
    ((resets[session.id] ?? 0) > now ? limited : fresh).push(session);
  }
  if (fresh.length === 0) {
    const earliest = Math.min(...Object.values(resets));
    throw new AllSessionsLimitedError(Math.max(1, earliest - now));
  }

  let lastError: unknown;

  for (const session of [...fresh, ...limited]) {
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

async function limitedResets(sessions: CookieSession[]): Promise<Record<string, number>> {
  const sink = metricsSink();
  const ids = sessions.map((session) => session.id);
  if (sink) {
    try {
      return await sink.getLimitedResets(ids);
    } catch {
      // Fall through to the isolate-local view; a DO hiccup must not
      // degrade request handling.
    }
  }
  return localLimitedResets(ids);
}
