import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../functions/media";
import { isAllowedMediaUrl } from "../src/media";

describe("isAllowedMediaUrl", () => {
  afterEach(() => vi.restoreAllMocks());

  it("allows only HTTPS X media hosts", () => {
    expect(isAllowedMediaUrl("https://pbs.twimg.com/media/test.jpg")).toBe(true);
    expect(isAllowedMediaUrl("https://video.twimg.com/test.mp4")).toBe(true);
    expect(isAllowedMediaUrl("http://pbs.twimg.com/media/test.jpg")).toBe(false);
    expect(isAllowedMediaUrl("https://pbs.twimg.com.example.com/test.jpg")).toBe(false);
    expect(isAllowedMediaUrl("https://example.com/test.jpg")).toBe(false);
  });

  it("does not forward non-media or upstream error bodies", async () => {
    const request = new Request(
      "https://nitter.example/media?url=https%3A%2F%2Fpbs.twimg.com%2Ftest",
    );
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response("<script>alert(1)</script>", {
        headers: { "content-type": "text/html" },
      }),
    );
    const invalidType = await onRequestGet({ request } as never);
    expect(invalidType.status).toBe(502);
    expect(invalidType.headers.get("cache-control")).toBe("no-store");

    fetchMock.mockResolvedValueOnce(
      new Response("upstream details", {
        status: 404,
        headers: { "content-type": "text/html" },
      }),
    );
    const upstreamError = await onRequestGet({ request } as never);
    expect(upstreamError.status).toBe(404);
    expect(await upstreamError.text()).toBe("Media request failed");
  });
});
