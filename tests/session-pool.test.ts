import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CookieSession } from "../src/session";
import {
  assemblePool,
  loadAllSessions,
  loadOperatorSessions,
  loadSessionPool,
  newStewardToken,
  POOL_CACHE_TTL_MS,
  resetSessionPoolCache,
  sessionCreatedAt,
  sessionLabel,
  stewardTokenFromRequest,
} from "../src/session-pool";
import {
  getStewardSessions,
  listDonatedSessions,
  OPERATOR_KEY,
  putOperatorSessions,
  putStewardSessions,
  scanDonatedSessions,
  type DonatedSession,
} from "../src/session-store";

// In-memory KV with call counters and knobs for failing individual reads, so
// tests can assert exactly what the pool cache kept off the real namespace.
class FakeKV {
  private map = new Map<string, string>();
  gets = 0;
  lists = 0;
  failsList = false;
  unreadable = new Set<string>();
  gate?: Promise<void>;

  async get(key: string, options?: { type?: string }): Promise<unknown> {
    this.gets++;
    if (this.unreadable.has(key)) throw new Error("kv down");
    const value = this.map.get(key);
    if (value === undefined) return null;
    return options?.type === "json" ? JSON.parse(value) : value;
  }

  async put(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.map.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }>; list_complete: true }> {
    this.lists++;
    if (this.failsList) throw new Error("kv down");
    await this.gate;
    const prefix = options?.prefix ?? "";
    return {
      keys: [...this.map.keys()].filter((key) => key.startsWith(prefix)).sort().map((name) => ({ name })),
      list_complete: true,
    };
  }
}

function snowflakeFor(isoDate: string): string {
  return ((BigInt(new Date(isoDate).getTime()) - 1288834974657n) << 22n).toString();
}

function envSession(id: string, username = "op"): CookieSession {
  return { kind: "cookie", username, id, authToken: "a".repeat(32), ct0: "c".repeat(32) };
}

function donation(id: string, ownerToken: string, visibility: "public" | "private"): DonatedSession {
  return {
    kind: "cookie",
    username: "donor",
    id,
    authToken: "d".repeat(32),
    ct0: "e".repeat(32),
    ownerToken,
    visibility,
    donatedAt: 1_700_000_000_000,
  };
}

const operator = envSession(snowflakeFor("2019-06-01T00:00:00Z"));
const steward = newStewardToken();
const other = newStewardToken();
const env = { SESSION_STORE: new FakeKV() as unknown as KVNamespace };

describe("steward identity", () => {
  it("reads a valid token from the cookie header", () => {
    const request = new Request("https://nitter.test/settings/sessions", {
      headers: { cookie: `theme=Nitter; nitter_steward=${steward}` },
    });
    expect(stewardTokenFromRequest(request)).toBe(steward);
  });

  it("rejects malformed or missing tokens", () => {
    const malformed = new Request("https://nitter.test/", { headers: { cookie: "nitter_steward=nothex" } });
    const missing = new Request("https://nitter.test/");
    expect(stewardTokenFromRequest(malformed)).toBeUndefined();
    expect(stewardTokenFromRequest(missing)).toBeUndefined();
  });

  it("mints 64-char hex tokens", () => {
    expect(newStewardToken()).toMatch(/^[0-9a-f]{64}$/);
    expect(newStewardToken()).not.toBe(newStewardToken());
  });
});

describe("assemblePool", () => {
  it("puts own private sessions first, then operator, then public donations, deduped by id", () => {
    const ownPrivate = donation("100", steward, "private");
    const duplicateOfOperator = donation(operator.id, other, "public");
    const publicDonation = donation("200", other, "public");
    const othersPrivate = donation("300", other, "private");
    const pool = assemblePool([operator], [ownPrivate, duplicateOfOperator, publicDonation, othersPrivate], steward);
    expect(pool.map((session) => session.id)).toEqual([ownPrivate.id, operator.id, publicDonation.id]);
  });

  it("excludes all donations for anonymous visitors", () => {
    const pool = assemblePool([operator], [donation("100", steward, "public")], undefined);
    expect(pool.map((session) => session.id)).toEqual([operator.id, "100"]);
  });

  it("keeps only operator sessions when donations are private to someone else", () => {
    const pool = assemblePool([operator], [donation("300", other, "private")], steward);
    expect(pool.map((session) => session.id)).toEqual([operator.id]);
  });
});

describe("labels and ages", () => {
  it("labels sessions deterministically without leaking the id", () => {
    const session = envSession("1234567890123456789");
    const first = sessionLabel(env, session);
    expect(first).toMatch(/^anon-[0-9a-f]{10}$/);
    expect(first).toBe(sessionLabel(env, session));
    expect(first).not.toContain(session.id);
    expect(sessionLabel(env, envSession("9876543210987654321"))).not.toBe(first);
  });

  it("re-keys labels when the HMAC key rotates", () => {
    const session = envSession("1234567890123456789");
    expect(sessionLabel({ ...env, NITTER_HMAC_KEY: "fresh-key" }, session)).not.toBe(sessionLabel(env, session));
  });

  it("decodes account creation from the snowflake id", () => {
    expect(sessionCreatedAt(envSession(snowflakeFor("2021-02-03T04:05:06Z")))).toBe(Date.parse("2021-02-03T04:05:06Z") / 1000);
    expect(sessionCreatedAt(envSession("junk"))).toBe(0);
  });
});

describe("session store", () => {
  it("round-trips steward records through list and get", async () => {
    const kv = new FakeKV() as unknown as KVNamespace;
    await putStewardSessions(kv, steward, [donation("100", steward, "public")]);
    await putStewardSessions(kv, other, [donation("200", other, "private")]);

    const mine = await getStewardSessions(kv, steward);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: "100", ownerToken: steward, visibility: "public" });

    const all = await listDonatedSessions(kv);
    expect(all.map((session) => session.id).sort()).toEqual(["100", "200"]);
  });

  it("reports an unreadable record without dropping the other stewards' sessions", async () => {
    const kv = new FakeKV() as unknown as KVNamespace;
    await putStewardSessions(kv, steward, [donation("100", steward, "public")]);
    const readable = [expect.objectContaining({ id: "100" })];
    expect(await scanDonatedSessions(kv)).toEqual({ sessions: readable, complete: true });

    await kv.put(`owner/${other}`, "not json");
    expect(await scanDonatedSessions(kv)).toEqual({ sessions: readable, complete: false });
  });

  it("drops malformed entries and enforces the owner key over stored tokens", async () => {
    const kv = new FakeKV() as unknown as KVNamespace;
    await kv.put(`owner/${steward}`, JSON.stringify([
      { kind: "cookie", username: "donor", id: "100", auth_token: "d".repeat(32), ct0: "e".repeat(32), visibility: "public", donatedAt: 1, ownerToken: "forged-owner-token" },
      { kind: "cookie", id: "nope" },
    ]));
    const sessions = await getStewardSessions(kv, steward);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.ownerToken).toBe(steward);
  });

  it("deletes the record when the last session is removed", async () => {
    const kv = new FakeKV() as unknown as KVNamespace;
    await putStewardSessions(kv, steward, [donation("100", steward, "public")]);
    await putStewardSessions(kv, steward, []);
    expect(await listDonatedSessions(kv)).toEqual([]);
  });

  it("round-trips the operator record and drops malformed entries", async () => {
    const kv = new FakeKV() as unknown as KVNamespace;
    await putOperatorSessions(kv, [operator]);
    const loaded = await loadOperatorSessions({ SESSION_STORE: kv });
    expect(loaded).toEqual([operator]);

    await kv.put(OPERATOR_KEY, JSON.stringify([
      { kind: "cookie", username: "op", id: "55", auth_token: "f".repeat(32), ct0: "9".repeat(32) },
      { kind: "cookie", id: "nope" },
    ]));
    const filtered = await loadOperatorSessions({ SESSION_STORE: kv });
    expect(filtered.map((session) => session.id)).toEqual(["55"]);

    await putOperatorSessions(kv, []);
    expect(await loadOperatorSessions({ SESSION_STORE: kv })).toEqual([]);
  });
});

describe("loadSessionPool / loadAllSessions", () => {
  beforeEach(() => {
    resetSessionPoolCache();
  });

  it("serves operator sessions plus public and own private donations", async () => {
    const kv = new FakeKV() as unknown as KVNamespace;
    await putOperatorSessions(kv, [operator]);
    await putStewardSessions(kv, steward, [
      donation("100", steward, "private"),
      donation("101", steward, "public"),
    ]);
    await putStewardSessions(kv, other, [
      donation("200", other, "private"),
      donation("201", other, "public"),
    ]);
    const testEnv = { SESSION_STORE: kv };

    const anonymous = await loadSessionPool(testEnv, new Request("https://nitter.test/"));
    expect(anonymous.map((session) => session.id)).toEqual([operator.id, "101", "201"]);

    const own = await loadSessionPool(testEnv, new Request("https://nitter.test/", {
      headers: { cookie: `nitter_steward=${steward}` },
    }));
    expect(own.map((session) => session.id)).toEqual(["100", operator.id, "101", "201"]);

    const everything = await loadAllSessions(testEnv);
    expect(everything.map((session) => session.id).sort()).toEqual([operator.id, "100", "101", "200", "201"].sort());
  });

  it("serves an empty pool when the store fails or is unbound", async () => {
    const broken = {
      get: () => Promise.reject(new Error("kv down")),
      list: () => Promise.reject(new Error("kv down")),
    } as unknown as KVNamespace;
    const pool = await loadSessionPool({ ...env, SESSION_STORE: broken }, new Request("https://nitter.test/"));
    expect(pool).toEqual([]);

    const unbound = await loadSessionPool({}, new Request("https://nitter.test/"));
    expect(unbound).toEqual([]);
  });

  it("returns no sessions for a broken operator record", async () => {
    const kv = new FakeKV() as unknown as KVNamespace;
    await kv.put(OPERATOR_KEY, "not json");
    expect(await loadOperatorSessions({ SESSION_STORE: kv })).toEqual([]);
    expect(await loadOperatorSessions({})).toEqual([]);
  });
});

describe("pool cache", () => {
  const NOW = Date.parse("2026-11-24T00:00:00Z");
  const anonymous = () => new Request("https://nitter.test/");
  const asSteward = (token: string) => new Request("https://nitter.test/", {
    headers: { cookie: `nitter_steward=${token}` },
  });
  const ids = (sessions: CookieSession[]) => sessions.map((session) => session.id);
  // How to break the store, and what a request made during the breakage must
  // still be served.
  const OUTAGES: Array<[string, (store: FakeKV) => void, string[]]> = [
    ["a rejected list", (store) => { store.failsList = true; }, [operator.id]],
    ["an unreadable donation record", (store) => { store.unreadable.add(`owner/${steward}`); }, [operator.id]],
    ["an unreadable operator record", (store) => { store.unreadable.add(OPERATOR_KEY); }, ["200"]],
  ];

  let store: FakeKV;
  let kv: KVNamespace;
  let testEnv: { SESSION_STORE: KVNamespace };

  beforeEach(() => {
    resetSessionPoolCache();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    store = new FakeKV();
    kv = store as unknown as KVNamespace;
    testEnv = { SESSION_STORE: kv };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the store once per isolate until the cache expires", async () => {
    await putOperatorSessions(kv, [operator]);
    await putStewardSessions(kv, steward, [donation("100", steward, "public")]);

    await loadSessionPool(testEnv, anonymous());
    await loadSessionPool(testEnv, anonymous());
    expect(store.lists).toBe(1);
    // The operator record and the one donation record; reads are cached too.
    expect(store.gets).toBe(2);

    vi.setSystemTime(NOW + POOL_CACHE_TTL_MS - 1);
    await loadSessionPool(testEnv, anonymous());
    expect(store.lists).toBe(1);

    vi.setSystemTime(NOW + POOL_CACHE_TTL_MS);
    await loadSessionPool(testEnv, anonymous());
    expect(store.lists).toBe(2);
  });

  it("serves changes to the store only once the cache expires", async () => {
    await putOperatorSessions(kv, [operator]);
    expect(ids(await loadSessionPool(testEnv, anonymous()))).toEqual([operator.id]);

    await putStewardSessions(kv, steward, [donation("200", steward, "public")]);
    expect(ids(await loadSessionPool(testEnv, anonymous()))).toEqual([operator.id]);

    vi.setSystemTime(NOW + POOL_CACHE_TTL_MS);
    expect(ids(await loadSessionPool(testEnv, anonymous()))).toEqual([operator.id, "200"]);
  });

  it("applies a donor's own changes at once while other visitors wait for the cache", async () => {
    await putOperatorSessions(kv, [operator]);
    await loadSessionPool(testEnv, anonymous());

    await putStewardSessions(kv, steward, [
      donation("101", steward, "public"),
      donation("100", steward, "private"),
    ]);
    expect(ids(await loadSessionPool(testEnv, asSteward(steward)))).toEqual(["100", operator.id, "101"]);
    expect(ids(await loadSessionPool(testEnv, anonymous()))).toEqual([operator.id]);

    vi.setSystemTime(NOW + POOL_CACHE_TTL_MS);
    expect(ids(await loadSessionPool(testEnv, anonymous()))).toEqual([operator.id, "101"]);

    await putStewardSessions(kv, steward, []);
    expect(ids(await loadSessionPool(testEnv, asSteward(steward)))).toEqual([operator.id]);
    expect(ids(await loadSessionPool(testEnv, anonymous()))).toEqual([operator.id, "101"]);

    vi.setSystemTime(NOW + 2 * POOL_CACHE_TTL_MS);
    expect(ids(await loadSessionPool(testEnv, anonymous()))).toEqual([operator.id]);
  });

  it("drops a donor's cached sessions when their record cannot be read", async () => {
    await putStewardSessions(kv, steward, [donation("101", steward, "public")]);
    expect(ids(await loadSessionPool(testEnv, anonymous()))).toEqual(["101"]);

    store.unreadable.add(`owner/${steward}`);
    expect(ids(await loadSessionPool(testEnv, asSteward(steward)))).toEqual([]);
  });

  it.each(OUTAGES)("serves what loaded and retries on the next request after %s", async (_outage, breakStore, served) => {
    await putOperatorSessions(kv, [operator]);
    await putStewardSessions(kv, steward, [donation("200", steward, "public")]);

    breakStore(store);
    expect(ids(await loadSessionPool(testEnv, anonymous()))).toEqual(served);

    store.failsList = false;
    store.unreadable.clear();
    expect(ids(await loadSessionPool(testEnv, anonymous()))).toEqual([operator.id, "200"]);
    expect(store.lists).toBe(2);
  });

  it("shares one KV read between requests that arrive during a refresh", async () => {
    await putOperatorSessions(kv, [operator]);
    let release!: () => void;
    store.gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = loadSessionPool(testEnv, anonymous());
    const second = loadSessionPool(testEnv, anonymous());
    release();
    const pools = await Promise.all([first, second]);

    expect(pools.map(ids)).toEqual([[operator.id], [operator.id]]);
    expect(store.lists).toBe(1);
  });
});
