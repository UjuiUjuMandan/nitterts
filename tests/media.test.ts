import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "../functions/media";
import { isAllowedMediaUrl, rewriteVideoManifest } from "../src/media";

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

  it("forwards byte ranges needed for video seeking", async () => {
    const request = new Request(
      "https://nitter.example/media?url=https%3A%2F%2Fvideo.twimg.com%2Fclip.mp4",
      { headers: { range: "bytes=100-199" } },
    );
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 206,
        headers: {
          "accept-ranges": "bytes",
          "content-range": "bytes 100-102/1000",
          "content-type": "video/mp4",
        },
      }),
    );
    const response = await onRequestGet({ request } as never);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toBeInstanceOf(Headers);
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).get("range")).toBe("bytes=100-199");
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 100-102/1000");
    expect(response.headers.get("content-type")).toBe("video/mp4");
  });

  it("rewrites HLS manifests so nested playlists and segments stay proxied", async () => {
    const target = "https://video.twimg.com/path/master.m3u8";
    const manifest = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio/index.m3u8"\nvideo/index.m3u8\n/segments/clip.ts\n';
    expect(rewriteVideoManifest(manifest, target)).toContain('URI="/media?url=https%3A%2F%2Fvideo.twimg.com%2Fpath%2Faudio%2Findex.m3u8"');
    expect(rewriteVideoManifest(manifest, target)).toContain("/media?url=https%3A%2F%2Fvideo.twimg.com%2Fpath%2Fvideo%2Findex.m3u8");
    expect(rewriteVideoManifest(manifest, target)).toContain("/media?url=https%3A%2F%2Fvideo.twimg.com%2Fsegments%2Fclip.ts");

    const request = new Request(`https://nitter.example/media?url=${encodeURIComponent(target)}`);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(manifest, {
      headers: { "content-type": "application/x-mpegURL", "content-length": String(manifest.length) },
    }));
    const response = await onRequestGet({ request } as never);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/vnd.apple.mpegurl");
    expect(response.headers.get("content-length")).toBeNull();
    expect(await response.text()).toContain("%2Fpath%2Fvideo%2Findex.m3u8");
  });
});
