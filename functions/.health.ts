import { parseSessions } from "../src/session";
import { sessionPoolHealth } from "../src/x/rate-limit";

export const onRequestGet: PagesFunction<Env> = ({ env }) => {
  let sessions;
  try {
    sessions = parseSessions(env.NITTER_SESSIONS ?? "");
  } catch {
    sessions = [];
  }
  return new Response(JSON.stringify(sessionPoolHealth(sessions)), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
};
