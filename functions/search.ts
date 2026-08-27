import { serveSearchPage } from "../src/serve/search";

export const onRequestGet: PagesFunction<Env> = (context) =>
  serveSearchPage(context.request, context.env);
