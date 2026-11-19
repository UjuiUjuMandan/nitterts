export function rssEnabled(env: { NITTER_ENABLE_RSS?: string }): boolean {
  return env.NITTER_ENABLE_RSS === "true";
}

export function rssNotFound(): Response {
  return new Response("Not found", { status: 404, headers: { "cache-control": "no-store" } });
}
