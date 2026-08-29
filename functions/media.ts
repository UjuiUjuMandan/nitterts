import { isAllowedMediaUrl, rewriteVideoManifest } from "../src/media";

export const onRequestGet: PagesFunction = async ({ request }) => {
  const target = new URL(request.url).searchParams.get("url") ?? "";
  if (!isAllowedMediaUrl(target)) {
    return new Response("Invalid media URL", { status: 400 });
  }

  const headers = new Headers({ accept: request.headers.get("accept") ?? "*/*" });
  const range = request.headers.get("range");
  if (range) headers.set("range", range);

  const upstream = await fetch(target, { headers, redirect: "manual" });
  if (upstream.status >= 300 && upstream.status < 400) {
    if (upstream.body) await upstream.body.cancel();
    return new Response("Media redirect rejected", { status: 502 });
  }
  if (!upstream.ok) {
    if (upstream.body) await upstream.body.cancel();
    return new Response("Media request failed", {
      status: upstream.status,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }

  const responseHeaders = new Headers();
  for (const name of ["accept-ranges", "content-range", "content-type", "etag"]) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  const contentType = upstream.headers.get("content-type") ?? "";
  const manifest = /mpegurl/i.test(contentType) || new URL(target).pathname.endsWith(".m3u8");
  if (!manifest && !/^(image|video|audio)\//i.test(contentType)) {
    if (upstream.body) await upstream.body.cancel();
    return new Response("Invalid media response", {
      status: 502,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    });
  }
  responseHeaders.set("cache-control", "public, max-age=604800, immutable");
  responseHeaders.set("x-content-type-options", "nosniff");

  if (manifest) {
    responseHeaders.set("content-type", "application/vnd.apple.mpegurl");
    responseHeaders.delete("content-range");
    responseHeaders.delete("etag");
    return new Response(rewriteVideoManifest(await upstream.text(), target), {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  const contentLength = upstream.headers.get("content-length");
  if (contentLength) responseHeaders.set("content-length", contentLength);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
};
