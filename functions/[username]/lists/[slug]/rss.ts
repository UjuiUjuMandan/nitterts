import { serveListSlugRssRedirect } from "../../../../src/serve/list";
import { rssEnabled, rssNotFound } from "../../../../src/serve/rss";

export const onRequestGet: PagesFunction<Env> = (context) => {
  if (!rssEnabled(context.env)) return rssNotFound();
  const username = context.params.username;
  const slug = context.params.slug;
  if (typeof username !== "string" || typeof slug !== "string") {
    return new Response("Invalid list", { status: 400 });
  }
  return serveListSlugRssRedirect(context.request, context.env, username, slug);
};
