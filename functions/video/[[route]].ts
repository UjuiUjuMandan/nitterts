import { verifyMediaSignature } from "../../src/media";
import { proxyMediaRequest } from "../../src/serve/media-proxy";

export const onRequestGet: PagesFunction = async ({ request }) => {
  const pathname = new URL(request.url).pathname;
  const rest = pathname.replace(/^\/video\//, "");
  const separator = rest.indexOf("/");
  if (separator === -1) {
    return new Response("Not found", { status: 404 });
  }
  const signature = rest.slice(0, separator);
  let target: string;
  try {
    target = decodeURIComponent(rest.slice(separator + 1));
  } catch {
    return new Response("Invalid media path", { status: 400 });
  }
  if (!verifyMediaSignature(target, signature)) {
    return new Response("Failed to verify signature", { status: 403 });
  }
  return proxyMediaRequest(target, {
    accept: request.headers.get("accept"),
    range: request.headers.get("range"),
  });
};
