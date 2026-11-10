import { beforeEach, describe, expect, it } from "vitest";
import type { CookieSession } from "../src/session";
import { AllSessionsLimitedError, withCookieSession } from "../src/x/sessions";
import { recordLimitedSessionParsed, resetRateLimitTracking } from "../src/x/rate-limit";
import { resetMetricsSink } from "../src/x/metrics-sink";
import { onRequestGet as serveApiUser } from "../functions/api/users/[username]";
import { putOperatorSessions } from "../src/session-store";
import { XApiError } from "../src/x/client";

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

function session(id: string): CookieSession {
  return { kind: "cookie", username: `user_${id.slice(0, 4)}`, id, authToken: "a".repeat(32), ct0: "c".repeat(32) };
}

const first = session("111");
const second = session("222");
const resetIn = (minutes: number) => Math.floor(Date.now() / 1000) + minutes * 60;

describe("limited-aware session selection", () => {
  beforeEach(() => {
    resetRateLimitTracking();
    resetMetricsSink();
  });

  it("fails fast with retry guidance when every session is limited", async () => {
    recordLimitedSessionParsed(first.id, resetIn(7));
    recordLimitedSessionParsed(second.id, resetIn(3));
    let attempts = 0;

    const call = withCookieSession([first, second], async () => {
      attempts++;
      return "done";
    });

    await expect(call).rejects.toBeInstanceOf(AllSessionsLimitedError);
    expect(attempts).toBe(0);
    await expect(call).rejects.toMatchObject({ retryAfterSeconds: expect.any(Number) });
    // Earliest reset wins, bounded to the smallest window.
    const error = await call.catch((thrown) => thrown as AllSessionsLimitedError);
    expect(error.retryAfterSeconds).toBeLessThanOrEqual(3 * 60);
    expect(error.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("prefers fresh sessions and skips limited ones entirely on success", async () => {
    recordLimitedSessionParsed(first.id, resetIn(9));
    const tried: string[] = [];

    const used = await withCookieSession([first, second], async (picked) => {
      tried.push(picked.id);
      return picked.id;
    });

    expect(used).toBe(second.id);
    expect(tried).toEqual([second.id]);
  });

  it("still falls back to a limited session when fresh ones fail retryably", async () => {
    recordLimitedSessionParsed(second.id, resetIn(9));
    const tried: string[] = [];

    const used = await withCookieSession([first, second], async (picked) => {
      tried.push(picked.id);
      if (picked === first) throw new XApiError(429, "Rate limit exceeded");
      return picked.id;
    });

    expect(used).toBe(second.id);
    expect(tried).toEqual([first.id, second.id]);
  });

  it("treats expired limit windows as fresh", async () => {
    recordLimitedSessionParsed(first.id, Math.floor(Date.now() / 1000) - 1);
    const used = await withCookieSession([first], async (picked) => picked.id);
    expect(used).toBe(first.id);
  });
});

describe("all-limited HTTP responses", () => {
  beforeEach(() => {
    resetRateLimitTracking();
    resetMetricsSink();
  });

  it("answers 503 with Retry-After from the API route", async () => {
    const kv = new FakeKV() as unknown as KVNamespace;
    await putOperatorSessions(kv, [session("123456789012345678")]);
    recordLimitedSessionParsed("123456789012345678", resetIn(4));
    const response = await serveApiUser({
      request: new Request("https://nitter.test/api/users/jack"),
      params: { username: "jack" },
      env: { SESSION_STORE: kv },
    } as never);

    expect(response.status).toBe(503);
    const retryAfter = Number(response.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(4 * 60);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("rate-limited") });
  });
});
