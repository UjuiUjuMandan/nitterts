import { loadAllSessions } from "../src/session-pool";
import { metricsSink } from "../src/x/metrics-sink";
import { sessionPoolDebug } from "../src/x/rate-limit";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (env.NITTER_DEBUG !== "true") {
    return new Response("Not found", { status: 404 });
  }
  const sessions = await loadAllSessions(env);
  const sink = metricsSink();
  let report;
  try {
    report = sink ? await sink.getDebug(sessions.map((session) => session.id)) : undefined;
  } catch {
    report = undefined;
  }
  if (!report) report = sessionPoolDebug(sessions);
  return new Response(JSON.stringify(report), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
};
