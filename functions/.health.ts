import { parseSessions } from "../src/session";
import { metricsSink } from "../src/x/metrics-sink";
import { sessionPoolHealth } from "../src/x/rate-limit";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  let sessions;
  try {
    sessions = parseSessions(env.NITTER_SESSIONS ?? "");
  } catch {
    sessions = [];
  }
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
