import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGraphql, XApiError } from "../src/x/client";
import { installMetricsSink, resetMetricsSink } from "../src/x/metrics-sink";
import { resetRateLimitTracking } from "../src/x/rate-limit";
import type { CookieSession } from "../src/session";

const session: CookieSession = { kind: "cookie", username: "alice", id: "123456789012345678", authToken: "a", ct0: "c" };

function mockXFetch(status: number, headers: Record<string, string>, body: string) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown) => {
    const url = String(input);
    if (url.includes("pair-dict")) {
      return new Response(JSON.stringify([{ animationKey: "0.000118", verification: "AAAAAAAAAAAAAAAAAAAAAA==" }]), { headers: { "content-type": "application/json" } });
    }
    return new Response(body, { status, headers: { "content-type": "application/json", ...headers } });
  });
}

describe("fetchGraphql metrics sink", () => {
  beforeEach(() => {
    resetRateLimitTracking();
    resetMetricsSink();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetMetricsSink();
  });

  it("records to the Durable Object sink without blocking or failing the request", async () => {
    const calls: string[] = [];
    installMetricsSink({
      getByName: () => ({
        beginPending: async (sessionId: string, nonce: string) => {
          calls.push(`begin:${sessionId}:${nonce.length > 0}`);
        },
        endPending: async (sessionId: string, nonce: string) => {
          calls.push(`end:${sessionId}:${nonce.length > 0}`);
        },
        recordApiStatus: async (operation: string, sessionId: string, status: { remaining: number }) => {
          calls.push(`api:${operation}:${sessionId}:${status.remaining}`);
        },
        recordLimited: async (sessionId: string, reset: number) => {
          calls.push(`limited:${sessionId}:${reset}`);
        },
      }),
    } as never);
    mockXFetch(200, {
      "x-rate-limit-limit": "50",
      "x-rate-limit-remaining": "49",
      "x-rate-limit-reset": "1999999999",
    }, "{}");

    const value = await fetchGraphql("TestOp", {}, {}, session);
    expect(value).toEqual({});
    expect(calls.filter((call) => call.startsWith("begin:"))).toHaveLength(1);
    expect(calls).toContain("api:TestOp:123456789012345678:49");
    expect(calls.filter((call) => call.startsWith("end:"))).toHaveLength(1);
    expect(calls.indexOf("begin:123456789012345678:true")).toBeLessThan(calls.indexOf("end:123456789012345678:true"));
  });

  it("survives a rejecting sink and records limited on 429", async () => {
    const rejection = async () => {
      throw new Error("durable object unavailable");
    };
    const limited: string[] = [];
    installMetricsSink({
      getByName: () => ({
        beginPending: rejection,
        endPending: rejection,
        recordApiStatus: rejection,
        recordLimited: async (sessionId: string, reset: number) => {
          limited.push(`${sessionId}:${reset}`);
        },
      }),
    } as never);
    mockXFetch(429, { "x-rate-limit-reset": "1999999999" }, "{}");

    await expect(fetchGraphql("TestOp", {}, {}, session)).rejects.toBeInstanceOf(XApiError);
    await new Promise((resolve) => setImmediate(resolve));
    expect(limited).toEqual(["123456789012345678:1999999999"]);
  });

  it("falls back to isolate-local tracking without a sink", async () => {
    mockXFetch(200, {
      "x-rate-limit-limit": "50",
      "x-rate-limit-remaining": "48",
      "x-rate-limit-reset": "1999999999",
    }, "{}");
    await fetchGraphql("TestOp", {}, {}, session);
    const { sessionPoolHealth } = await import("../src/x/rate-limit");
    expect(sessionPoolHealth([session]).requests).toEqual({ total: 2, apis: { TestOp: 2 } });
  });
});
