/**
 * Security configuration for edge request filtering.
 *
 * Blocked are evaluated in the Pages Functions middleware (functions/_middleware.ts)
 * before any route handler runs. Requests matching a rule receive a plain 403.
 */

/** Minimum HTTP protocol version allowed. Anything older is rejected. */
export const BLOCKED_HTTP_PROTOCOLS = ["HTTP/1.0", "HTTP/1.1"] as const;

/**
 * Autonomous System Numbers that are banned outright.
 * Typically hosting/VPN/proxy ranges used for scraping or abuse.
 */
export const BLOCKED_ASNS: readonly number[] = [
  132203, // Tencent
  63949,  // Akamai (Linode)
  24940,  // Hetzner
  16276,  // OVH
  45102,  // Alibaba
  14618,  // AWS
  212317, // Sia NanoMedia
  9009,   // M247
  54600,  // Clouvider
  202662 // GCore
];

const forbidden = () => new Response("Forbidden", {
  status: 403,
  statusText: "Forbidden",
  headers: { "content-type": "text/plain" }
});

/**
 * Returns a 403 Response when the request violates a security rule,
 * or null when the request is allowed to proceed.
 */
export function securityGuard(request: Request): Response | null {
  const cf = (request as Request & { cf?: { httpProtocol?: string; asn?: number } }).cf;

  if (cf?.httpProtocol && (BLOCKED_HTTP_PROTOCOLS as readonly string[]).includes(cf.httpProtocol)) {
    return forbidden();
  }

  if (cf?.asn && BLOCKED_ASNS.includes(cf.asn)) {
    return forbidden();
  }

  return null;
}
