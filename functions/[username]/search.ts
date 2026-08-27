import { serveSearchPage } from "../../src/serve/search";

export const onRequestGet: PagesFunction<Env> = (context) => {
  const username = context.params.username;
  if (typeof username !== "string") return new Response("Invalid username", { status: 400 });
  return serveSearchPage(context.request, context.env, username);
};
