import { parseSessions } from "../src/session";
import { metricsSink } from "../src/x/metrics-sink";
import { sessionPoolDebug } from "../src/x/rate-limit";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  if (env.NITTER_DEBUG !== "true") {
    return new Response("Not found", { status: 404 });
  }
  let sessions;
  try {
    sessions = parseSessions(env.NITTER_SESSIONS ?? "");
  } catch {
    sessions = [];
  }
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
