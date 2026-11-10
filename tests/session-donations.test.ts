import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serveSessionSettingsPage, serveSessionSettingsUpdate } from "../src/serve/session-settings";
import type { CookieSession } from "../src/session";
import { getStewardSessions, putOperatorSessions, putStewardSessions, type DonatedSession } from "../src/session-store";
import { newStewardToken, sessionLabel } from "../src/session-pool";
import { resetMetricsSink } from "../src/x/metrics-sink";
import { resetRateLimitTracking } from "../src/x/rate-limit";

class FakeKV {
  private map = new Map<string, string>();

  async get(key: string, options?: { type?: string }): Promise<unknown> {
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
    const prefix = options?.prefix ?? "";
    return {
      keys: [...this.map.keys()].filter((key) => key.startsWith(prefix)).sort().map((name) => ({ name })),
      list_complete: true,
    };
  }
}

const ORIGIN = "https://nitter.test";
const BURNER_ID = "1234567890123456789";

function operatorSession(id: string, username: string): CookieSession {
  return { kind: "cookie", username, id, authToken: "f".repeat(32), ct0: "9".repeat(32) };
}

function donationRecord(id: string, ownerToken: string, visibility: "public" | "private"): DonatedSession {
  return {
    kind: "cookie",
    username: "secret_donator",
    id,
    authToken: "d".repeat(32),
    ct0: "e".repeat(32),
    ownerToken,
    visibility,
    donatedAt: 1_700_000_000_000,
  };
}

function get(url: string, stewardCookie?: string): Request {
  const headers = stewardCookie ? { cookie: `nitter_steward=${stewardCookie}` } : undefined;
  return new Request(url, { headers });
}

function post(fields: Record<string, string>, stewardCookie?: string): Request {
  return new Request(`${ORIGIN}/settings/sessions`, {
    method: "POST",
    headers: {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      "content-type": "application/x-www-form-urlencoded",
      ...(stewardCookie ? { cookie: `nitter_steward=${stewardCookie}` } : {}),
    },
    body: new URLSearchParams(fields),
  });
}

// Intercepts the two outbound fetches the donation flow makes: the TID pair
// dictionary and the x.com GraphQL endpoint.
function mockXResponse(status: number, body: string) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown) => {
    const url = String(input);
    if (url.includes("pair-dict")) {
      return new Response(JSON.stringify([{ animationKey: "0.000118", verification: "AAAAAAAAAAAAAAAAAAAAAA==" }]), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(body, { status, headers: { "content-type": "application/json" } });
  });
}

function profileBody(id: string, username: string): string {
  return JSON.stringify({
    data: {
      userResult: {
        result: {
          rest_id: id,
          core: { screen_name: username, name: "Burner" },
          avatar: { image_url: "https://pbs.twimg.com/avatar_normal.jpg" },
          banner: {},
          location: {},
          website: {},
        },
      },
    },
  });
}

describe("GET /settings/sessions", () => {
  beforeEach(() => {
    resetRateLimitTracking();
    resetMetricsSink();
  });

  it("lists pool sessions anonymously without leaking ids or usernames", async () => {
    const kv = new FakeKV() as unknown as KVNamespace;
    await putStewardSessions(kv, newStewardToken(), [donationRecord(BURNER_ID, newStewardToken(), "public")]);
    await putOperatorSessions(kv, [operatorSession("555", "operator_acct")]);
    const env = { SESSION_STORE: kv };

    const response = await serveSessionSettingsPage(get(`${ORIGIN}/settings/sessions`), env);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("anon-");
    expect(html).not.toContain("operator_acct");
    expect(html).not.toContain("secret_donator");
    expect(html).not.toContain("555");
    expect(html).not.toContain(BURNER_ID);
    expect(html).not.toContain("f".repeat(32));
  });

  it("shows a donor their own private session but never other donors' private ones", async () => {
    const kv = new FakeKV() as unknown as KVNamespace;
    const steward = newStewardToken();
    const other = newStewardToken();
    await putStewardSessions(kv, steward, [donationRecord("111", steward, "private")]);
    await putStewardSessions(kv, other, [donationRecord("222", other, "private")]);
    await putOperatorSessions(kv, [operatorSession("555", "op")]);
    const env = { SESSION_STORE: kv };

    const html = await (await serveSessionSettingsPage(get(`${ORIGIN}/settings/sessions`, steward), env)).text();
    const label = sessionLabel(env, { id: "111" });
    expect(html).toContain(label);
    expect(html).not.toContain(sessionLabel(env, { id: "222" }));
    expect(html).toContain("Your donated sessions");
  });

  it("notes when donations are disabled", async () => {
    const response = await serveSessionSettingsPage(get(`${ORIGIN}/settings/sessions`), {});
    const html = await response.text();
    expect(html).toContain("Session donations are not enabled");
  });

  it("renders the added notice only for well-formed labels", async () => {
    const env = {};
    const good = await (await serveSessionSettingsPage(get(`${ORIGIN}/settings/sessions?added=anon-0123456789`), env)).text();
    expect(good).toContain("verified and stored");
    const bad = await (await serveSessionSettingsPage(get(`${ORIGIN}/settings/sessions?added=%3Cscript%3E`), env)).text();
    expect(bad).not.toContain("verified and stored");
    expect(bad).not.toContain("<script>");
  });
});

describe("POST /settings/sessions", () => {
  beforeEach(() => {
    resetRateLimitTracking();
    resetMetricsSink();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects cross-site submissions", async () => {
    const request = new Request(`${ORIGIN}/settings/sessions`, {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action: "donate", username: "a", auth_token: "b", ct0: "c" }),
    });
    const response = await serveSessionSettingsUpdate(request, {});
    expect(response.status).toBe(403);
  });

  it("rejects donations when no session store is bound", async () => {
    const response = await serveSessionSettingsUpdate(
      post({ action: "donate", username: "burner_acct", auth_token: "a".repeat(32), ct0: "c".repeat(32) }),
      {},
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("not enabled");
  });

  it("rejects malformed cookie values before contacting X", async () => {
    const fetchSpy = mockXResponse(200, "{}");
    const response = await serveSessionSettingsUpdate(
      post({ action: "donate", username: "burner_acct", auth_token: "zzz", ct0: "c".repeat(32) }),
      { SESSION_STORE: new FakeKV() as unknown as KVNamespace },
    );
    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stores a verified donation under a new steward cookie", async () => {
    mockXResponse(200, profileBody(BURNER_ID, "burner_acct"));
    const kv = new FakeKV() as unknown as KVNamespace;
    const env = { SESSION_STORE: kv };

    const response = await serveSessionSettingsUpdate(
      post({ action: "donate", username: "burner_acct", auth_token: "a".repeat(32), ct0: "c".repeat(40), visibility: "public" }),
      env,
    );
    expect(response.status).toBe(303);
    const location = response.headers.get("location") ?? "";
    expect(location).toMatch(/^\/settings\/sessions\?added=anon-[0-9a-f]{10}$/);

    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("nitter_steward=");
    expect(cookie).toContain("HttpOnly");
    const token = /nitter_steward=([0-9a-f]{64})/.exec(cookie)?.[1];
    expect(token).toBeDefined();

    const stored = await getStewardSessions(kv, token!);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: BURNER_ID,
      username: "burner_acct",
      visibility: "public",
      ownerToken: token,
    });
    expect(location).toContain(sessionLabel(env, { id: BURNER_ID }));
  });

  it("explains rejection when X refuses the donated cookies", async () => {
    mockXResponse(403, JSON.stringify({ errors: [{ message: "Could not authenticate you" }] }));
    const kv = new FakeKV() as unknown as KVNamespace;

    const response = await serveSessionSettingsUpdate(
      post({ action: "donate", username: "burner_acct", auth_token: "a".repeat(32), ct0: "c".repeat(32) }),
      { SESSION_STORE: kv },
    );
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("X rejected these cookies");
    expect(await getStewardSessions(kv, newStewardToken())).toEqual([]);
  });

  it("toggles visibility and revokes using labels bound to the steward cookie", async () => {
    const kv = new FakeKV() as unknown as KVNamespace;
    const steward = newStewardToken();
    await putStewardSessions(kv, steward, [donationRecord("111", steward, "public")]);
    const env = { SESSION_STORE: kv };
    const label = sessionLabel(env, { id: "111" });

    const toggled = await serveSessionSettingsUpdate(
      post({ action: "visibility", session: label, visibility: "private" }, steward),
      env,
    );
    expect(toggled.status).toBe(303);
    expect((await getStewardSessions(kv, steward))[0]?.visibility).toBe("private");

    const revoked = await serveSessionSettingsUpdate(
      post({ action: "revoke", session: label }, steward),
      env,
    );
    expect(revoked.status).toBe(303);
    expect(await getStewardSessions(kv, steward)).toEqual([]);
  });

  it("refuses to manage sessions owned by another steward", async () => {
    const kv = new FakeKV() as unknown as KVNamespace;
    const owner = newStewardToken();
    const attacker = newStewardToken();
    await putStewardSessions(kv, owner, [donationRecord("111", owner, "public")]);
    const env = { SESSION_STORE: kv };
    const label = sessionLabel(env, { id: "111" });

    const response = await serveSessionSettingsUpdate(
      post({ action: "revoke", session: label }, attacker),
      env,
    );
    expect(response.status).toBe(400);
    expect((await getStewardSessions(kv, owner)).map((session) => session.id)).toEqual(["111"]);
  });
});
