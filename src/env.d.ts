interface Env {
  NITTER_SESSIONS: string;
  NITTER_DEBUG?: string;
  NITTER_HMAC_KEY?: string;
  // Optional; enables visitor session donations (/settings/sessions). When
  // absent the instance serves operator sessions from NITTER_SESSIONS only.
  SESSION_STORE?: KVNamespace;
}
