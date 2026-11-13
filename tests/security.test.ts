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
});
