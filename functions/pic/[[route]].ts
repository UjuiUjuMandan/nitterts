import { isAllowedMediaUrl, normalizePicUrl } from "../../src/media";
import { proxyMediaRequest, withOrigVariant } from "../../src/serve/media-proxy";

export const onRequestGet: PagesFunction = async ({ request }) => {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return new Response("Invalid media path", { status: 400 });
  }
  const encoded = pathname.replace(/^\/pic\/(?:orig\/)?/, "");
  if (!encoded) {
    return new Response("Not found", { status: 404 });
  }
  const orig = pathname.startsWith("/pic/orig/");
  let target = normalizePicUrl(encoded);
  if (orig) target = withOrigVariant(target);
  // The pic route carries no signature, so it must not relay video content;
  // upstream blocks amplify_video here for the same reason.
  try {
    if (target.includes("/amplify_video/") || new URL(target).hostname === "video.twimg.com") {
      return new Response("Not found", { status: 404 });
    }
  } catch {
    return new Response("Invalid media path", { status: 400 });
  }
  if (!isAllowedMediaUrl(target)) {
    return new Response("Invalid media URL", { status: 400 });
  }
  return proxyMediaRequest(target, {
    accept: request.headers.get("accept"),
    range: request.headers.get("range"),
  });
};
