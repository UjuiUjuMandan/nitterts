import { serveProfilePage } from "../../src/serve/profile";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const username = context.params.username;
  if (typeof username !== "string") {
    return new Response("Invalid username", { status: 400 });
  }
  return serveProfilePage(context.request, context.env, username, "media");
};
