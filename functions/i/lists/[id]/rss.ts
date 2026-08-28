import { serveListRss } from "../../../../src/serve/list";

export const onRequestGet: PagesFunction<Env> = (context) => {
  const id = context.params.id;
  if (typeof id !== "string") return new Response("Invalid list ID", { status: 400 });
  return serveListRss(context.request, context.env, id);
};
