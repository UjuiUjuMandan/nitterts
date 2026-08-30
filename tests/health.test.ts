import { beforeEach, describe, expect, it } from "vitest";
import { onRequestGet as serveHealth } from "../functions/.health";
import { onRequestGet as serveSessions } from "../functions/.sessions";
import type { CookieSession } from "../src/session";
import { installMetricsSink, resetMetricsSink } from "../src/x/metrics-sink";
import { beginSessionRequest, endSessionRequest, recordApiStatus, recordLimitedSession, resetRateLimitTracking, sessionPoolDebug, sessionPoolHealth } from "../src/x/rate-limit";

function snowflakeFor(isoDate: string): string {
  return ((BigInt(new Date(isoDate).getTime()) - 1288834974657n) << 22n).toString();
}

function session(id: string): CookieSession {
  return { kind: "cookie", username: `user_${id.slice(0, 4)}`, id, authToken: "a", ct0: "c" };
}

const oldSession = session(snowflakeFor("2019-06-01T00:00:00Z"));
const newSession = session(snowflakeFor("2024-03-01T00:00:00Z"));
const sessions = [oldSession, newSession];

describe("session pool health", () => {
  beforeEach(() => {
    resetRateLimitTracking();
    resetMetricsSink();
  });

  it("summarizes sessions and per-api request usage", () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    const headers = new Headers({
      "x-rate-limit-limit": "50",
      "x-rate-limit-remaining": "42",
      "x-rate-limit-reset": String(reset),
    });
    recordApiStatus("UserByScreenName", oldSession, headers);
    recordApiStatus("UserByScreenName", newSession, headers);
    recordApiStatus("SearchTimeline", oldSession, new Headers({
      "x-rate-limit-limit": "10",
      "x-rate-limit-remaining": "10",
      "x-rate-limit-reset": String(reset),
    }));

    const health = sessionPoolHealth(sessions);
    expect(health.sessions.total).toBe(2);
    expect(health.sessions.limited).toBe(0);
    expect(health.sessions.oauth).toEqual({ total: 0, limited: 0 });
    expect(health.sessions.cookie).toEqual({ total: 2, limited: 0 });
    expect(health.sessions.oldest).toBe("2019-06-01T00:00:00Z");
    expect(health.sessions.newest).toBe("2024-03-01T00:00:00Z");
    // Midpoint of 2019-06-01 and 2024-03-01 is 2021-10-15T12:00:00Z.
    expect(health.sessions.average).toBe("2021-10-15T12:00:00Z");
    expect(health.requests).toEqual({
      total: 16,
      apis: { UserByScreenName: 16, SearchTimeline: 0 },
    });
  });

  it("counts sessions limited by 429 responses", () => {
    const reset = Math.floor(Date.now() / 1000) + 600;
    recordApiStatus("UserByScreenName", newSession, new Headers({
      "x-rate-limit-limit": "50",
      "x-rate-limit-remaining": "0",
      "x-rate-limit-reset": String(reset),
    }));
    recordLimitedSession(newSession, new Headers({ "x-rate-limit-reset": String(reset) }));
    const health = sessionPoolHealth(sessions);
    expect(health.sessions.limited).toBe(1);
    expect(health.sessions.cookie.limited).toBe(1);

    const debug = sessionPoolDebug(sessions);
    expect(debug[newSession.id]).toMatchObject({
      kind: "cookie",
      limited: true,
      apis: { UserByScreenName: { remaining: 0, reset } },
    });
    // Sessions without a fresh API window are omitted, like upstream.
    expect(debug[oldSession.id]).toBeUndefined();

    beginSessionRequest(newSession.id);
    beginSessionRequest(newSession.id);
    endSessionRequest(newSession.id);
    expect(sessionPoolDebug(sessions)[newSession.id]).toMatchObject({ pending: 1 });
    endSessionRequest(newSession.id);
    expect(sessionPoolDebug(sessions)[newSession.id]).toMatchObject({ pending: 0 });
  });

  it("serves /.health JSON from the request context env", async () => {
    const response = await serveHealth({
      request: new Request("https://nitter.test/.health"),
      env: {
        NITTER_SESSIONS: [
          JSON.stringify({ kind: "cookie", username: "alice", id: snowflakeFor("2020-01-01T00:00:00Z"), auth_token: "a", ct0: "c" }),
        ].join("\n"),
      },
    } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    const body = JSON.parse(await response.text());
    expect(body.sessions.total).toBe(1);
    expect(body.sessions.cookie).toEqual({ total: 1, limited: 0 });
    expect(body.requests).toEqual({ total: 0, apis: {} });
  });

  it("gates /.sessions behind NITTER_DEBUG", async () => {
    const denied = await serveSessions({
      request: new Request("https://nitter.test/.sessions"),
      env: { NITTER_SESSIONS: "unused" },
    } as never);
    expect(denied.status).toBe(404);

    const allowed = await serveSessions({
      request: new Request("https://nitter.test/.sessions"),
      env: { NITTER_SESSIONS: "unused", NITTER_DEBUG: "true" },
    } as never);
    expect(allowed.status).toBe(200);
    expect(JSON.parse(await allowed.text())).toEqual({});
  });

  it("serves reports from the installed Durable Object sink", async () => {
    const sessionId = snowflakeFor("2022-01-01T00:00:00Z");
    const requests: string[] = [];
    const report = {
      sessions: {
        total: 1,
        limited: 1,
        oauth: { total: 0, limited: 0 },
        cookie: { total: 1, limited: 1 },
        oldest: "2022-01-01T00:00:00Z",
        newest: "2022-01-01T00:00:00Z",
        average: "2022-01-01T00:00:00Z",
      },
      requests: { total: 7, apis: { UserByScreenName: 7 } },
    };
    installMetricsSink({
      getByName: () => ({
        getHealth: async (ids: string[]) => {
          requests.push(`health:${ids.join(",")}`);
          return report;
        },
      }),
    } as never);

    const response = await serveHealth({
      request: new Request("https://nitter.test/.health"),
      env: {
        NITTER_SESSIONS: [
          JSON.stringify({ kind: "cookie", username: "bob", id: sessionId, auth_token: "a", ct0: "c" }),
        ].join("\n"),
      },
    } as never);
    expect(response.status).toBe(200);
    expect(JSON.parse(await response.text())).toEqual(report);
    expect(requests).toEqual([`health:${sessionId}`]);
  });
});
