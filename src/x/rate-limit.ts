import type { CookieSession } from "../session";

// Isolate-local fallback for health metrics, used when no Durable Object
// binding is installed (local dev, tests). Cross-isolate metrics live in the
// HealthMetrics Durable Object; both keep the same report shapes.
export type ApiStatus = { limit: number; remaining: number; reset: number };

export type HealthReport = {
  sessions: {
    total: number;
    limited: number;
    oauth: { total: number; limited: number };
    cookie: { total: number; limited: number };
    oldest: string;
    newest: string;
    average: string;
  };
  requests: { total: number; apis: Record<string, number> };
};

export type DebugReport = Record<string, {
  kind: "cookie";
  apis: Record<string, { remaining: number; reset: number }>;
  pending: number;
  limited?: true;
}>;

const apiStats = new Map<string, Map<string, ApiStatus>>();
const limitedSessions = new Map<string, number>();
const pendingSessions = new Map<string, number>();

export function parseRateLimitHeaders(headers: Headers): ApiStatus | undefined {
  const limit = numberHeader(headers, "x-rate-limit-limit");
  const remaining = numberHeader(headers, "x-rate-limit-remaining");
  const reset = numberHeader(headers, "x-rate-limit-reset");
  if (limit === undefined || remaining === undefined || reset === undefined) return undefined;
  return { limit, remaining, reset };
}

export function parseLimitedReset(headers: Headers): number {
  return numberHeader(headers, "x-rate-limit-reset") ?? Math.floor(Date.now() / 1000) + 900;
}

export function beginSessionRequest(sessionId: string): void {
  pendingSessions.set(sessionId, (pendingSessions.get(sessionId) ?? 0) + 1);
}

export function endSessionRequest(sessionId: string): void {
  const pending = (pendingSessions.get(sessionId) ?? 0) - 1;
  if (pending > 0) pendingSessions.set(sessionId, pending);
  else pendingSessions.delete(sessionId);
}

export function resetRateLimitTracking(): void {
  apiStats.clear();
  limitedSessions.clear();
  pendingSessions.clear();
}

export function recordApiStatus(operation: string, session: CookieSession, headers: Headers): void {
  const status = parseRateLimitHeaders(headers);
  if (!status) return;
  recordApiStatusParsed(operation, session.id, status);
}

export function recordApiStatusParsed(operation: string, sessionId: string, status: ApiStatus): void {
  let perSession = apiStats.get(operation);
  if (!perSession) {
    perSession = new Map();
    apiStats.set(operation, perSession);
  }
  perSession.set(sessionId, status);
}

export function recordLimitedSession(session: CookieSession, headers: Headers): void {
  recordLimitedSessionParsed(session.id, parseLimitedReset(headers));
}

export function recordLimitedSessionParsed(sessionId: string, reset: number): void {
  limitedSessions.set(sessionId, reset);
}

export function sessionPoolHealth(sessions: CookieSession[]): HealthReport {
  const now = Math.floor(Date.now() / 1000);
  let oldest = Number.POSITIVE_INFINITY;
  let newest = 0;
  let average = 0n;
  let limited = 0;

  for (const session of sessions) {
    const created = snowflakeToEpoch(session.id);
    if (created > newest) newest = created;
    if (created < oldest) oldest = created;
    average += BigInt(created);
    if (isLimited(session.id, now)) limited++;
  }

  const reqsPerApi: Record<string, number> = {};
  let totalReqs = 0;
  const known = new Set(sessions.map((session) => session.id));
  for (const [operation, perSession] of apiStats) {
    let reqs = 0;
    let activeWindows = 0;
    for (const [sessionId, status] of perSession) {
      if (!known.has(sessionId) || status.reset < now) continue;
      activeWindows++;
      reqs += status.limit - status.remaining;
    }
    if (activeWindows > 0) {
      reqsPerApi[operation] = reqs;
      totalReqs += reqs;
    }
  }

  const count = sessions.length;
  return {
    sessions: {
      total: count,
      limited,
      oauth: { total: 0, limited: 0 },
      cookie: { total: count, limited },
      oldest: count ? fromUnix(oldest) : fromUnix(0),
      newest: fromUnix(newest),
      average: count ? fromUnix(Number(average / BigInt(count))) : fromUnix(0),
    },
    requests: { total: totalReqs, apis: reqsPerApi },
  };
}

export function sessionPoolDebug(sessions: CookieSession[]): DebugReport {
  const now = Math.floor(Date.now() / 1000);
  const list: DebugReport = {};
  for (const session of sessions) {
    const entry: typeof list[string] = { kind: "cookie", apis: {}, pending: pendingSessions.get(session.id) ?? 0 };
    if (isLimited(session.id, now)) entry.limited = true;
    for (const [operation, perSession] of apiStats) {
      const status = perSession.get(session.id);
      if (!status || status.reset <= now) continue;
      entry.apis[operation] = { remaining: status.remaining, reset: status.reset };
    }
    // Upstream only lists sessions that have a fresh API window.
    if (Object.keys(entry.apis).length === 0) continue;
    list[session.id] = entry;
  }
  return list;
}

function isLimited(sessionId: string, now: number): boolean {
  const reset = limitedSessions.get(sessionId);
  if (reset === undefined) return false;
  if (reset <= now) {
    limitedSessions.delete(sessionId);
    return false;
  }
  return true;
}

function snowflakeToEpoch(flake: string): number {
  try {
    return Number(((BigInt(flake) >> 22n) + 1288834974657n) / 1000n);
  } catch {
    return 0;
  }
}

function fromUnix(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace(".000Z", "Z");
}

function numberHeader(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name);
  if (raw === null) return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
