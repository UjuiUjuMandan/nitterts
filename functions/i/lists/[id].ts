import { serveListPage } from "../../../src/serve/list";

export const onRequestGet: PagesFunction<Env> = (context) => {
  const id = context.params.id;
  if (typeof id !== "string") return new Response("Invalid list ID", { status: 400 });
  return serveListPage(context.request, context.env, id, "tweets");
};
