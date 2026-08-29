import { parseSessions } from "../src/session";
import { sessionPoolDebug } from "../src/x/rate-limit";

export const onRequestGet: PagesFunction<Env> = ({ env }) => {
  if (env.NITTER_DEBUG !== "true") {
    return new Response("Not found", { status: 404 });
  }
  let sessions;
  try {
    sessions = parseSessions(env.NITTER_SESSIONS ?? "");
  } catch {
    sessions = [];
  }
  return new Response(JSON.stringify(sessionPoolDebug(sessions)), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
};
