interface Env {
  NITTER_DEBUG?: string;
  NITTER_HMAC_KEY?: string;
  // Holds every cookie session: the operator's own (seeded with
  // scripts/seed-sessions.ts into the "operator/sessions" key) plus visitor
  // donations (/settings/sessions). Optional so a missing binding degrades
  // to an empty pool instead of crashing.
  SESSION_STORE?: KVNamespace;
}
