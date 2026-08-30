import { DurableObject } from "cloudflare:workers";
import type { ApiStatus, DebugReport, HealthReport } from "../../src/x/rate-limit";

type Snapshot = {
  apis: [string, [string, ApiStatus][]][];
  limited: [string, number][];
};

const ALARM_INTERVAL_MS = 60_000;
const PENDING_MAX_AGE_MS = 120_000;

// Single global Durable Object holding cross-isolate health metrics, the
// Workers analog of upstream Nitter's in-process session pool. Deployed as
// its own Worker because Pages projects cannot host Durable Object classes;
// the Pages project binds it via script_name. State is kept in memory and
// snapshotted to storage by an alarm, so an eviction can lose at most one
// minute of metrics.
type WorkerEnv = Record<string, unknown>;

export class HealthMetrics extends DurableObject<WorkerEnv> {
  private apis = new Map<string, Map<string, ApiStatus>>();
  private limited = new Map<string, number>();
  private pending = new Map<string, Map<string, number>>();
  private readonly loaded: Promise<void>;

  constructor(ctx: DurableObjectState) {
    super(ctx, {});
    this.loaded = this.load();
  }

  async recordApiStatus(operation: string, sessionId: string, status: ApiStatus): Promise<void> {
    await this.loaded;
    let perSession = this.apis.get(operation);
    if (!perSession) {
      perSession = new Map();
      this.apis.set(operation, perSession);
    }
    perSession.set(sessionId, status);
  }

  async recordLimited(sessionId: string, reset: number): Promise<void> {
    await this.loaded;
    this.limited.set(sessionId, reset);
  }

  async beginPending(sessionId: string, nonce: string): Promise<void> {
    await this.loaded;
    let perSession = this.pending.get(sessionId);
    if (!perSession) {
      perSession = new Map();
      this.pending.set(sessionId, perSession);
    }
    perSession.set(nonce, Date.now());
  }

  async endPending(sessionId: string, nonce: string): Promise<void> {
    await this.loaded;
    this.pending.get(sessionId)?.delete(nonce);
  }

  async getHealth(sessionIds: string[]): Promise<HealthReport> {
    await this.loaded;
    const now = Math.floor(Date.now() / 1000);
    const known = new Set(sessionIds);
    let oldest = Number.POSITIVE_INFINITY;
    let newest = 0;
    let average = 0n;
    let limitedCount = 0;

    for (const sessionId of sessionIds) {
      const created = snowflakeToEpoch(sessionId);
      if (created > newest) newest = created;
      if (created < oldest) oldest = created;
      average += BigInt(created);
      if (this.isLimited(sessionId, now)) limitedCount++;
    }

    const reqsPerApi: Record<string, number> = {};
    let totalReqs = 0;
    for (const [operation, perSession] of this.apis) {
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

    const count = sessionIds.length;
    return {
      sessions: {
        total: count,
        limited: limitedCount,
        oauth: { total: 0, limited: 0 },
        cookie: { total: count, limited: limitedCount },
        oldest: count ? fromUnix(oldest) : fromUnix(0),
        newest: fromUnix(newest),
        average: count ? fromUnix(Number(average / BigInt(count))) : fromUnix(0),
      },
      requests: { total: totalReqs, apis: reqsPerApi },
    };
  }

  async getDebug(sessionIds: string[]): Promise<DebugReport> {
    await this.loaded;
    const now = Math.floor(Date.now() / 1000);
    const list: DebugReport = {};
    for (const sessionId of sessionIds) {
      const entry: DebugReport[string] = {
        kind: "cookie",
        apis: {},
        pending: this.pending.get(sessionId)?.size ?? 0,
      };
      if (this.isLimited(sessionId, now)) entry.limited = true;
      for (const [operation, perSession] of this.apis) {
        const status = perSession.get(sessionId);
        if (!status || status.reset <= now) continue;
        entry.apis[operation] = { remaining: status.remaining, reset: status.reset };
      }
      // Upstream only lists sessions that have a fresh API window.
      if (Object.keys(entry.apis).length === 0) continue;
      list[sessionId] = entry;
    }
    return list;
  }

  async alarm(): Promise<void> {
    await this.loaded;
    const now = Date.now();
    for (const perSession of this.pending.values()) {
      for (const [nonce, started] of perSession) {
        if (now - started > PENDING_MAX_AGE_MS) perSession.delete(nonce);
      }
    }
    const nowSeconds = Math.floor(now / 1000);
    for (const [sessionId, reset] of this.limited) {
      if (reset <= nowSeconds) this.limited.delete(sessionId);
    }
    const snapshot: Snapshot = {
      apis: [...this.apis].map(([operation, perSession]) => [operation, [...perSession]]),
      limited: [...this.limited],
    };
    await this.ctx.storage.put("state", snapshot);
    await this.ctx.storage.setAlarm(now + ALARM_INTERVAL_MS);
  }

  private isLimited(sessionId: string, now: number): boolean {
    const reset = this.limited.get(sessionId);
    return reset !== undefined && reset > now;
  }

  private async load(): Promise<void> {
    try {
      const snapshot = await this.ctx.storage.get<Snapshot>("state");
      if (snapshot) {
        this.apis = new Map(snapshot.apis.map(([operation, perSession]) => [operation, new Map(perSession)]));
        this.limited = new Map(snapshot.limited);
      }
      if (await this.ctx.storage.getAlarm() === null) {
        await this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
      }
    } catch {
      // Metrics are best effort; a cold start without storage keeps defaults.
    }
  }
}

export default {
  fetch(): Response {
    return new Response("nitterts health metrics worker\n", { headers: { "content-type": "text/plain" } });
  },
};

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
