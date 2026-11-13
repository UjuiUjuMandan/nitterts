import { describe, expect, it } from "vitest";
import { securityGuard } from "../src/security";

function requestWithCf(cf?: { httpProtocol?: string; asn?: number }): Request {
  const request = new Request("https://nitterts.pages.dev/");
  if (cf) {
    Object.defineProperty(request, "cf", { value: cf });
  }
  return request;
}

describe("securityGuard", () => {
  it("blocks HTTP/1.1 requests", () => {
    expect(securityGuard(requestWithCf({ httpProtocol: "HTTP/1.1" }))?.status).toBe(403);
  });

  it("blocks HTTP/1.0 requests", () => {
    expect(securityGuard(requestWithCf({ httpProtocol: "HTTP/1.0" }))?.status).toBe(403);
  });

  it("allows HTTP/2 and HTTP/3", () => {
    expect(securityGuard(requestWithCf({ httpProtocol: "HTTP/2", asn: 13335 }))).toBeNull();
    expect(securityGuard(requestWithCf({ httpProtocol: "HTTP/3", asn: 13335 }))).toBeNull();
  });

  it("blocks requests from blocked ASNs", () => {
    for (const asn of [132203, 63949, 24940, 16276, 45102, 14618, 212317, 9009, 54600, 202662]) {
      expect(securityGuard(requestWithCf({ httpProtocol: "HTTP/2", asn }))?.status).toBe(403);
    }
  });

  it("allows requests from unlisted ASNs", () => {
    expect(securityGuard(requestWithCf({ httpProtocol: "HTTP/2", asn: 7922 }))).toBeNull();
  });

  it("allows requests without cf metadata", () => {
    expect(securityGuard(requestWithCf())).toBeNull();
  });

  it("allows the status monitor bearer on blocked ASNs and HTTP/1.1", () => {
    const token = "test-token";
    const headers = { authorization: `Bearer ${token}` };
    const blockedAsn = new Request("https://nitterts.pages.dev/", { headers });
    Object.defineProperty(blockedAsn, "cf", { value: { httpProtocol: "HTTP/2", asn: 24940 } });
    expect(securityGuard(blockedAsn, token)).toBeNull();

    const http11 = new Request("https://nitterts.pages.dev/", {
      headers: { "x-status-page-bearer": token }
    });
    Object.defineProperty(http11, "cf", { value: { httpProtocol: "HTTP/1.1", asn: 14618 } });
    expect(securityGuard(http11, token)).toBeNull();
  });

  it("rejects wrong or missing bearer tokens", () => {
    const asn = 24940;
    const wrong = new Request("https://nitterts.pages.dev/", {
      headers: { authorization: "Bearer wrong" }
    });
    Object.defineProperty(wrong, "cf", { value: { httpProtocol: "HTTP/2", asn } });
    expect(securityGuard(wrong, "test-token")?.status).toBe(403);

    const none = requestWithCf({ httpProtocol: "HTTP/2", asn });
    expect(securityGuard(none, "test-token")?.status).toBe(403);
  });

  it("still blocks ASNs when no token secret is configured", () => {
    expect(securityGuard(requestWithCf({ httpProtocol: "HTTP/2", asn: 24940 }))?.status).toBe(403);
  });
});
