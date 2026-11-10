import { loadSessionPool } from "../src/session-pool";
import { metricsSink } from "../src/x/metrics-sink";
import { sessionPoolHealth } from "../src/x/rate-limit";

export const onRequestGet: PagesFunction<Env> = async ({ env, request }) => {
  const sessions = await loadSessionPool(env, request);
  const sink = metricsSink();
  let report;
  try {
    report = sink ? await sink.getHealth(sessions.map((session) => session.id)) : undefined;
  } catch {
    report = undefined;
  }
  if (!report) report = sessionPoolHealth(sessions);
  return new Response(JSON.stringify(report), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
};
