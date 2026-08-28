import { serveListSlugRedirect } from "../../../src/serve/list";

export const onRequestGet: PagesFunction<Env> = (context) => {
  const username = context.params.username;
  const slug = context.params.slug;
  if (typeof username !== "string" || typeof slug !== "string") {
    return new Response("Invalid list", { status: 400 });
  }
  return serveListSlugRedirect(context.request, context.env, username, slug);
};
