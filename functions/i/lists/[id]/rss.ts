import { serveListRss } from "../../../../src/serve/list";
import { rssEnabled, rssNotFound } from "../../../../src/serve/rss";

export const onRequestGet: PagesFunction<Env> = (context) => {
  if (!rssEnabled(context.env)) return rssNotFound();
  const id = context.params.id;
  if (typeof id !== "string") return new Response("Invalid list ID", { status: 400 });
  return serveListRss(context.request, context.env, id);
};
