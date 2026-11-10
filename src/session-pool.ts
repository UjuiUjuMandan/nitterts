import { createHash, createHmac, randomBytes } from "node:crypto";
import type { CookieSession } from "./session";
import { getOperatorSessions, listDonatedSessions, type DonatedSession } from "./session-store";

// Session pool assembly: every session lives in the SESSION_STORE KV namespace —
// the operator's own under "operator/sessions" (seeded with scripts/seed-sessions.ts)
// plus visitor donations under "owner/<token>". Donations marked "private" are
// only ever used for requests that carry the donating browser's steward cookie,
// and are served before the shared pool so donors' own traffic leans on their
// own session first.

export const STEWARD_COOKIE = "nitter_steward";
export const STEWARD_MAX_AGE = 31_536_000;

// A donor manages sessions through an anonymous random token in an HttpOnly
// cookie. No account, no username, no IP storage; clearing the cookie loses
// management access (revocation then requires the operator or logging the
// session out on X, which invalidates the cookies everywhere).
export function stewardTokenFromRequest(request: Request): string | undefined {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== STEWARD_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    return /^[0-9a-f]{64}$/.test(value) ? value : undefined;
  }
  return undefined;
}

export function newStewardToken(): string {
  return randomBytes(32).toString("hex");
}

export function stewardCookie(token: string, secure: boolean): string {
  return `${STEWARD_COOKIE}=${token}; Path=/; Max-Age=${STEWARD_MAX_AGE}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}

export async function loadOperatorSessions(env: Env): Promise<CookieSession[]> {
  if (!env.SESSION_STORE) return [];
  try {
    return await getOperatorSessions(env.SESSION_STORE);
  } catch {
    // A KV outage must not take pages down; fall back to donations only.
    return [];
  }
}

export async function loadDonatedSessions(env: Env): Promise<DonatedSession[]> {
  if (!env.SESSION_STORE) return [];
  try {
    return await listDonatedSessions(env.SESSION_STORE);
  } catch {
    // A KV outage must not take pages down; fall back to operator sessions.
    return [];
  }
}

export function assemblePool(
  operator: CookieSession[],
  donated: DonatedSession[],
  stewardToken: string | undefined,
): CookieSession[] {
  const own = stewardToken
    ? donated.filter((session) => session.ownerToken === stewardToken && session.visibility === "private")
    : [];
  const shared = donated.filter((session) => session.visibility === "public");
  const seen = new Set<string>();
  const pool: CookieSession[] = [];
  for (const session of [...own, ...operator, ...shared]) {
    if (seen.has(session.id)) continue;
    seen.add(session.id);
    pool.push(session);
  }
  return pool;
}

export async function loadSessionPool(env: Env, request: Request): Promise<CookieSession[]> {
  return assemblePool(
    await loadOperatorSessions(env),
    await loadDonatedSessions(env),
    stewardTokenFromRequest(request),
  );
}

// Every session including all private donations; for operator-only reports
// (/.sessions is gated behind NITTER_DEBUG) and never for public rendering.
export async function loadAllSessions(env: Env): Promise<CookieSession[]> {
  const donated = await loadDonatedSessions(env);
  const seen = new Set<string>();
  const all: CookieSession[] = [];
  for (const session of [...await loadOperatorSessions(env), ...donated]) {
    if (seen.has(session.id)) continue;
    seen.add(session.id);
    all.push(session);
  }
  return all;
}

// Sessions visible to a given visitor: the shared pool plus that visitor's
// own private donations, but never another visitor's private sessions.
export type SessionOrigin = "operator" | "donor" | "you";

// Public labels identify pool sessions in the UI without exposing X user ids
// or usernames. Keyed with a secret derived from NITTER_HMAC_KEY so outsiders
// cannot confirm a guessed account id by hashing it (X knows user ids; plain
// sha256 would let it match labels to accounts). Rotating NITTER_HMAC_KEY
// changes all labels.
export function sessionLabel(env: Env, session: Pick<CookieSession, "id">): string {
  const key = createHash("sha256")
    .update(`${env.NITTER_HMAC_KEY ?? ""}|nitterts-session-label`)
    .digest();
  return `anon-${createHmac("sha256", key).update(session.id).digest("hex").slice(0, 10)}`;
}

export function sessionCreatedAt(session: Pick<CookieSession, "id">): number {
  try {
    return Number(((BigInt(session.id) >> 22n) + 1288834974657n) / 1000n);
  } catch {
    return 0;
  }
}
