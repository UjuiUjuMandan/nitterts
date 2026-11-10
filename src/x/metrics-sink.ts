import type { HealthMetrics } from "../../health-worker/src/index";

// Module-level access to the HealthMetrics Durable Object stub. The binding
// is identical for every request, so caching the stub is safe; it is installed
// by the root middleware, which is the only place with an Env in the X client
// call path. Falls back to isolate-local tracking when absent.
type HealthNamespace = DurableObjectNamespace<HealthMetrics>;

type WaitUntil = (promise: Promise<unknown>) => void;

let stub: DurableObjectStub<HealthMetrics> | undefined;
// Refreshed by the middleware on every request. Routing sink RPCs through
// ctx.waitUntil guarantees their delivery even after the response returns;
// without it the runtime may cancel in-flight fire-and-forget promises.
let waitUntil: WaitUntil | undefined;

export function installMetricsSink(
  namespace: DurableObjectNamespace | undefined,
  waitUntilFn?: WaitUntil,
): void {
  waitUntil = waitUntilFn;
  if (!namespace) return;
  stub ??= (namespace as HealthNamespace).getByName("global");
}

export function metricsSink(): DurableObjectStub<HealthMetrics> | undefined {
  return stub;
}

// Fire-and-forget sink dispatch: metrics must never fail or delay an X API
// request, but when waitUntil is available the runtime holds the request open
// long enough for the RPC to actually land.
export function dispatchSinkCall(call: Promise<unknown>): void {
  const handled = call.catch(() => {});
  if (waitUntil) waitUntil(handled);
  else void handled;
}

export function resetMetricsSink(): void {
  stub = undefined;
  waitUntil = undefined;
}
