import { isAllowedMediaUrl, verifyMediaSignature } from "../src/media";
import { proxyMediaRequest } from "../src/serve/media-proxy";

// Legacy endpoint kept for previously rendered pages and RSS caches;
// new links use the upstream /pic and /video path shapes. Cached image
// URLs predate signatures, so only video content still requires one.
export const onRequestGet: PagesFunction = async ({ request }) => {
  const params = new URL(request.url).searchParams;
  const target = params.get("url") ?? "";
  const isVideo = isAllowedMediaUrl(target) && new URL(target).hostname === "video.twimg.com";
  if (isVideo && !verifyMediaSignature(target, params.get("sig"))) {
    return new Response("Failed to verify signature", { status: 403 });
  }
  return proxyMediaRequest(target, {
    accept: request.headers.get("accept"),
    range: request.headers.get("range"),
  });
};
