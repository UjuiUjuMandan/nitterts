// Shared plumbing for same-origin form POST handlers (preferences, session
// donations). Browsers force-set Sec-Fetch-Site and page JS cannot forge it.
// Some privacy extensions and sandboxed contexts send Origin: null; those are
// accepted only when the browser still reports the request as same-origin.

const MAX_BODY_BYTES = 8 * 1024;

// Cloudflare terminates TLS at its edge before the worker, so request.url can
// arrive as http:// while the browser-originated Origin header is https://.
// The edge overwrites x-forwarded-proto, so trusting it cannot be spoofed;
// take the last element because overwrite-style proxies emit a single value
// while append-style chains put the client-supplied value first.
export function effectiveRequestUrl(request: Request): URL {
  const url = new URL(request.url);
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",").pop()?.trim().toLowerCase();
  if (forwarded === "https" || forwarded === "http") url.protocol = `${forwarded}:`;
  return url;
}

export function validateMutation(request: Request): Response | undefined {
  const url = effectiveRequestUrl(request);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const sameOrigin = origin === url.origin
    || ((origin === null || origin === "null") && fetchSite === "same-origin");
  if (!sameOrigin || fetchSite === "cross-site") {
    return new Response("Cross-site form update rejected", { status: 403 });
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return new Response("Unsupported content type", { status: 415 });
  }
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) return new Response("Request body too large", { status: 413 });
  return undefined;
}

export async function readForm(request: Request): Promise<URLSearchParams | Response> {
  if (!request.body) return new URLSearchParams();
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let bytesRead = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > MAX_BODY_BYTES) return new Response("Request body too large", { status: 413 });
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return new URLSearchParams(body);
  } finally {
    await reader.cancel();
  }
}

export function safeReturnTo(value: string | null, requestUrl: URL): string | undefined {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return undefined;
  try {
    const target = new URL(value, requestUrl);
    return target.origin === requestUrl.origin ? `${target.pathname}${target.search}${target.hash}` : undefined;
  } catch {
    return undefined;
  }
}

export { MAX_BODY_BYTES };
