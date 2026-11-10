import type { CookieSession } from "./session";

// Donated cookie sessions, persisted in the SESSION_STORE KV namespace as one
// record per donating browser ("steward"): key "owner/<token>" holds the JSON
// array of sessions donated under that token. Keeping each steward's sessions
// in a single key makes management (list / toggle visibility / revoke) a
// one-key read-modify-write that can never race across different stewards.
// The shared pool is assembled by listing the "owner/" prefix, an eventually
// consistent index maintained by KV itself, so a fresh donation may take up
// to ~60 seconds to serve other visitors.

export type SessionVisibility = "public" | "private";

export type DonatedSession = CookieSession & {
  ownerToken: string;
  visibility: SessionVisibility;
  donatedAt: number;
};

export const MAX_SESSIONS_PER_STEWARD = 10;

const OWNER_PREFIX = "owner/";
const STEWARD_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const ID_PATTERN = /^\d{1,19}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
const TOKEN_PATTERN = /^[0-9a-f]{16,256}$/;

export function isStewardToken(value: unknown): value is string {
  return typeof value === "string" && STEWARD_TOKEN_PATTERN.test(value);
}

export function ownerKey(token: string): string {
  return `${OWNER_PREFIX}${token}`;
}

export async function getStewardSessions(
  kv: KVNamespace,
  token: string,
): Promise<DonatedSession[]> {
  const raw = await kv.get<unknown>(ownerKey(token), { type: "json" });
  return parseStewardRecord(token, raw);
}

export async function putStewardSessions(
  kv: KVNamespace,
  token: string,
  sessions: DonatedSession[],
): Promise<void> {
  if (sessions.length === 0) {
    await kv.delete(ownerKey(token));
    return;
  }
  // Wire format keeps the NITTER_SESSIONS field names (auth_token/ct0).
  await kv.put(
    ownerKey(token),
    JSON.stringify(sessions.map((session) => ({
      kind: "cookie",
      username: session.username,
      id: session.id,
      auth_token: session.authToken,
      ct0: session.ct0,
      visibility: session.visibility,
      donatedAt: session.donatedAt,
    }))),
  );
}

// Lists every donated session across all stewards. Used to assemble the
// shared request pool and for operator-facing reports; per-visitor pages must
// filter out other stewards' private sessions before rendering. Sorted by
// donation time (then id) so pool order is deterministic regardless of KV key
// ordering.
export async function listDonatedSessions(kv: KVNamespace): Promise<DonatedSession[]> {
  const collected: DonatedSession[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: OWNER_PREFIX, cursor });
    for (const key of page.keys) {
      const token = key.name.slice(OWNER_PREFIX.length);
      if (!isStewardToken(token)) continue;
      try {
        collected.push(...await getStewardSessions(kv, token));
      } catch {
        // One unreadable record must not take the whole pool down.
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor !== undefined);
  return collected.sort((a, b) => a.donatedAt - b.donatedAt || (a.id < b.id ? -1 : 1));
}

export function parseStewardRecord(token: string, value: unknown): DonatedSession[] {
  if (!Array.isArray(value)) return [];
  const sessions: DonatedSession[] = [];
  for (const entry of value) {
    // ownerToken is taken from the key, never from the stored payload, so a
    // corrupted record cannot claim another steward's sessions.
    const session = parseDonatedSession(entry, token);
    if (session) sessions.push(session);
    if (sessions.length >= MAX_SESSIONS_PER_STEWARD) break;
  }
  return sessions;
}

function parseDonatedSession(value: unknown, ownerToken: string): DonatedSession | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record.kind !== "cookie") return undefined;
  const { username, id, auth_token, ct0, visibility, donatedAt } = record;
  if (
    typeof username !== "string" || !USERNAME_PATTERN.test(username) ||
    typeof id !== "string" || !ID_PATTERN.test(id) ||
    typeof auth_token !== "string" || !TOKEN_PATTERN.test(auth_token) ||
    typeof ct0 !== "string" || !TOKEN_PATTERN.test(ct0) ||
    (visibility !== "public" && visibility !== "private") ||
    typeof donatedAt !== "number" || !Number.isFinite(donatedAt)
  ) {
    return undefined;
  }
  return {
    kind: "cookie",
    username,
    id,
    authToken: auth_token,
    ct0,
    ownerToken,
    visibility,
    donatedAt,
  };
}
