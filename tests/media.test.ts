import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet as legacyMediaHandler } from "../functions/media";
import { onRequestGet as picHandler } from "../functions/pic/[[route]]";
import { onRequestGet as videoHandler } from "../functions/video/[[route]]";
import {
  installMediaSigner,
  isAllowedMediaUrl,
  mediaProxyUrl,
  mediaSignature,
  origPicUrl,
  picUrl,
  resetMediaSigner,
  rewriteVideoManifest,
  verifyMediaSignature,
  videoUrl,
} from "../src/media";

describe("isAllowedMediaUrl", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetMediaSigner();
  });

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
    const invalidType = await legacyMediaHandler({ request } as never);
    expect(invalidType.status).toBe(502);
    expect(invalidType.headers.get("cache-control")).toBe("no-store");

    fetchMock.mockResolvedValueOnce(
      new Response("upstream details", {
        status: 404,
        headers: { "content-type": "text/html" },
      }),
    );
    const upstreamError = await legacyMediaHandler({ request } as never);
    expect(upstreamError.status).toBe(404);
    expect(await upstreamError.text()).toBe("Media request failed");
  });

  it("forwards byte ranges needed for video seeking", async () => {
    const target = "https://video.twimg.com/clip.mp4";
    const request = new Request(`https://nitter.example${videoUrl(target)}`, { headers: { range: "bytes=100-199" } });
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
    const response = await videoHandler({ request } as never);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toBeInstanceOf(Headers);
    expect((fetchMock.mock.calls[0]?.[1]?.headers as Headers).get("range")).toBe("bytes=100-199");
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 100-102/1000");
    expect(response.headers.get("content-type")).toBe("video/mp4");
  });
});

describe("upstream media URL shapes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetMediaSigner();
  });

  it("shortens tweet photos and keeps full URLs for banners and avatars", () => {
    expect(picUrl("https://pbs.twimg.com/media/HQ2fNW6a0AAJhsD.png"))
      .toBe("/pic/media%2FHQ2fNW6a0AAJhsD.png");
    expect(picUrl("https://pbs.twimg.com/profile_banners/1/2"))
      .toBe("/pic/https%3A%2F%2Fpbs.twimg.com%2Fprofile_banners%2F1%2F2");
    expect(origPicUrl("https://pbs.twimg.com/media/HQ2fNW6a0AAJhsD.png"))
      .toBe("/pic/orig/media%2FHQ2fNW6a0AAJhsD.png");
    expect(mediaProxyUrl("https://pbs.twimg.com/media/x.jpg:thumb"))
      .toBe("/pic/media%2Fx.jpg%3Athumb");
  });

  it("signs video URLs into the path", () => {
    installMediaSigner("test-secret");
    const target = "https://video.twimg.com/clip.mp4";
    const href = videoUrl(target);
    expect(href).toBe(`/video/${mediaSignature(target)}/https%3A%2F%2Fvideo.twimg.com%2Fclip.mp4`);
    expect(href).toMatch(/^\/video\/[0-9a-f]{13}\//);
    expect(verifyMediaSignature(target, mediaSignature(target))).toBe(true);
    expect(mediaProxyUrl(target)).toBe(href);
  });

  it("serves /pic with an implied pbs host", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Uint8Array([1]), {
      headers: { "content-type": "image/jpeg" },
    }));
    const served = await picHandler({
      request: new Request("https://nitter.example/pic/media%2Fpic.jpg"),
    } as never);
    expect(served.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://pbs.twimg.com/media/pic.jpg");
  });

  it("rejects video hosts, amplify urls, and malformed paths on /pic", async () => {
    const videoHost = await picHandler({
      request: new Request("https://nitter.example/pic/https%3A%2F%2Fvideo.twimg.com%2Fclip.mp4"),
    } as never);
    expect(videoHost.status).toBe(404);

    const amplify = await picHandler({
      request: new Request("https://nitter.example/pic/media%2Famplify_video%2Fx.mp4"),
    } as never);
    expect(amplify.status).toBe(404);

    const foreign = await picHandler({
      request: new Request("https://nitter.example/pic/https%3A%2F%2Fexample.com%2Fx.jpg"),
    } as never);
    expect(foreign.status).toBe(400);

    const malformed = await picHandler({
      request: new Request("https://nitter.example/pic/x%.jpg"),
    } as never);
    expect(malformed.status).toBe(400);

    const malformedVideo = await videoHandler({
      request: new Request("https://nitter.example/video/abc/https%3A%2F%2"),
    } as never);
    expect(malformedVideo.status).toBe(400);
  });

  it("overrides an existing name param on /pic/orig", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Uint8Array([1]), {
      headers: { "content-type": "image/png" },
    }));
    const response = await picHandler({
      request: new Request("https://nitter.example/pic/orig/media%2Forig.png%3Fname%3Dsmall"),
    } as never);
    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://pbs.twimg.com/media/orig.png?name=orig");
  });

  it("appends name=orig on /pic/orig", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Uint8Array([1]), {
      headers: { "content-type": "image/png" },
    }));
    const response = await picHandler({
      request: new Request("https://nitter.example/pic/orig/media%2Forig.png"),
    } as never);
    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://pbs.twimg.com/media/orig.png?name=orig");
  });

  it("rejects forged video signatures", async () => {
    installMediaSigner("test-secret");
    const forged = await videoHandler({
      request: new Request("https://nitter.example/video/0000000000000/https%3A%2F%2Fvideo.twimg.com%2Fother.mp4"),
    } as never);
    expect(forged.status).toBe(403);
    expect(await forged.text()).toBe("Failed to verify signature");

    const target = "https://video.twimg.com/ok.mp4";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(new Uint8Array([1]), {
      headers: { "content-type": "video/mp4" },
    }));
    const signed = await videoHandler({ request: new Request(`https://nitter.example${videoUrl(target)}`) } as never);
    expect(signed.status).toBe(200);
  });

  it("keeps legacy /media working for cached urls while gating video", async () => {
    installMediaSigner("test-secret");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Uint8Array([1]), {
      headers: { "content-type": "image/jpeg" },
    }));

    const cachedImage = await legacyMediaHandler({
      request: new Request("https://nitter.example/media?url=https%3A%2F%2Fpbs.twimg.com%2Fold.jpg"),
    } as never);
    expect(cachedImage.status).toBe(200);

    const cachedVideoNoSig = await legacyMediaHandler({
      request: new Request("https://nitter.example/media?url=https%3A%2F%2Fvideo.twimg.com%2Fold.mp4"),
    } as never);
    expect(cachedVideoNoSig.status).toBe(403);

    const target = "https://video.twimg.com/old.mp4";
    const cachedVideoSigned = await legacyMediaHandler({
      request: new Request(`https://nitter.example/media?url=${encodeURIComponent(target)}&sig=${mediaSignature(target)}`),
    } as never);
    expect(cachedVideoSigned.status).toBe(200);
    fetchMock.mockRestore();
  });

  it("rewrites HLS manifests with signed video and pic links", () => {
    installMediaSigner("test-secret");
    const target = "https://video.twimg.com/path/master.m3u8";
    const manifest = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio/index.m3u8"\nvideo/index.m3u8\n/segments/clip.ts\n#EXT-X-KEY:URI="https://pbs.twimg.com/key.key"\n';
    const rewritten = rewriteVideoManifest(manifest, target);
    const audio = "https://video.twimg.com/path/audio/index.m3u8";
    expect(rewritten).toContain(`URI="${videoUrl(audio)}"`);
    expect(rewritten).toContain(videoUrl("https://video.twimg.com/path/video/index.m3u8"));
    expect(rewritten).toContain(videoUrl("https://video.twimg.com/segments/clip.ts"));
    expect(rewritten).toContain(`URI="${picUrl("https://pbs.twimg.com/key.key")}"`);
  });
});
