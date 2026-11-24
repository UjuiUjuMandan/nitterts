import { createHash, createHmac, randomBytes } from "node:crypto";
import type { CookieSession } from "./session";
import {
  compareDonations,
  getOperatorSessions,
  getStewardSessions,
  listDonatedSessions,
  scanDonatedSessions,
  type DonatedSession,
} from "./session-store";

// Session pool assembly: every session lives in the SESSION_STORE KV namespace —
// the operator's own under "operator/sessions" (seeded with scripts/seed-sessions.ts)
// plus visitor donations under "owner/<token>". Donations marked "private" are
// only ever used for requests that carry the donating browser's steward cookie,
// and are served before the shared pool so donors' own traffic leans on their
// own session first.
//
// Every dynamic route needs the pool, and reading it costs a KV list request —
// the most expensive KV operation — plus a read per record. Uncached that is
// one list per request, which turns a scraping wave straight into a KV bill.
// So each isolate keeps what it last read for POOL_CACHE_TTL_MS and goes back
// to KV at most once per window.

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

// Single uncached reads. Request paths go through loadPoolSources instead;
// these remain for the operator's uncached diagnostic view of the store.
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

// How long an isolate serves the pool it last read from KV. A new donation, a
// visibility change, a revocation, or a reseed of the operator sessions
// reaches other visitors within this window (plus KV's own list propagation);
// a donor's own requests never wait for it.
export const POOL_CACHE_TTL_MS = 5 * 60_000;

// The two halves of the pool as stored. Objects inside a cached value are
// shared by every request in the isolate and must be treated as read-only.
export type PoolSources = { operator: CookieSession[]; donated: DonatedSession[] };

type PoolCache = { sources: PoolSources; expires: number; loading?: Promise<PoolSources> };

let poolCache: PoolCache | undefined;

// Tests only: the cache otherwise outlives every request in the isolate.
export function resetSessionPoolCache(): void {
  poolCache = undefined;
}

// Operator sessions and donations for one visitor: the cached KV snapshot,
// with a donor's own record read fresh when the request carries their steward
// cookie, so donating, toggling visibility, and revoking apply to them at
// once instead of when the cache happens to expire.
export async function loadPoolSources(env: Env, steward: string | undefined): Promise<PoolSources> {
  const sources = await loadCachedPool(env);
  if (!steward) return sources;
  return { operator: sources.operator, donated: await withOwnDonations(env, sources.donated, steward) };
}

async function loadCachedPool(env: Env): Promise<PoolSources> {
  // A slot object rather than bare module variables: resetSessionPoolCache()
  // detaches it, so a refresh still in flight across a reset writes into the
  // detached slot instead of resurrecting the old pool.
  const cache = (poolCache ??= { sources: { operator: [], donated: [] }, expires: 0 });
  if (cache.expires > Date.now()) return cache.sources;
  // Concurrent requests share one refresh, so an expiring cache costs one KV
  // pass per isolate however many requests arrive during it.
  cache.loading ??= refreshPool(env, cache);
  return cache.loading;
}

async function refreshPool(env: Env, cache: PoolCache): Promise<PoolSources> {
  try {
    const read = await readPool(env);
    // A failed read answers this request the way an uncached one would and is
    // retried on the next; caching it would stretch a KV blip to a whole TTL.
    if (read.complete) {
      cache.sources = read.sources;
      cache.expires = Date.now() + POOL_CACHE_TTL_MS;
    }
    return read.sources;
  } finally {
    cache.loading = undefined;
  }
}

// One KV pass for the whole pool, both halves in parallel. Anything that
// fails — an unbound store, a rejected list, an unreadable record — marks the
// read incomplete: what did load is still served, as the uncached loaders
// fall back above, but nothing is kept.
async function readPool(env: Env): Promise<{ sources: PoolSources; complete: boolean }> {
  const kv = env.SESSION_STORE;
  if (!kv) return { sources: { operator: [], donated: [] }, complete: false };
  const [operator, scan] = await Promise.all([
    settled(getOperatorSessions(kv)),
    settled(scanDonatedSessions(kv)),
  ]);
  return {
    sources: { operator: operator ?? [], donated: scan?.sessions ?? [] },
    complete: operator !== undefined && scan?.complete === true,
  };
}

async function settled<T>(read: Promise<T>): Promise<T | undefined> {
  try {
    return await read;
  } catch {
    return undefined;
  }
}

// Replaces a donor's cached donations with a fresh copy of their record.
async function withOwnDonations(
  env: Env,
  donated: DonatedSession[],
  steward: string,
): Promise<DonatedSession[]> {
  const others = donated.filter((session) => session.ownerToken !== steward);
  const kv = env.SESSION_STORE;
  if (!kv) return others;
  let own: DonatedSession[];
  try {
    own = await getStewardSessions(kv, steward);
  } catch {
    // Unreadable: fail closed rather than serve sessions the donor may just have revoked.
    return others;
  }
  return [...others, ...own].sort(compareDonations);
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
  const steward = stewardTokenFromRequest(request);
  const { operator, donated } = await loadPoolSources(env, steward);
  return assemblePool(operator, donated, steward);
}

// Every session including all private donations; for operator-only reports
// (/.sessions is gated behind NITTER_DEBUG) and never for public rendering.
// Uncached, so it reports the store as it is rather than as some isolate last
// read it.
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
