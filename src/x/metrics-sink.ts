import type { HealthMetrics } from "../../health-worker/src/index";

// Module-level access to the HealthMetrics Durable Object stub. The binding
// is identical for every request, so caching the stub is safe; it is installed
// by the root middleware, which is the only place with an Env in the X client
// call path. Falls back to isolate-local tracking when absent.
type HealthNamespace = DurableObjectNamespace<HealthMetrics>;

let stub: DurableObjectStub<HealthMetrics> | undefined;

export function installMetricsSink(namespace: DurableObjectNamespace | undefined): void {
  if (!namespace) return;
  stub ??= (namespace as HealthNamespace).getByName("global");
}

export function metricsSink(): DurableObjectStub<HealthMetrics> | undefined {
  return stub;
}

export function resetMetricsSink(): void {
  stub = undefined;
}
