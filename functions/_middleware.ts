import { preferencesRedirect } from "../src/preferences";

export const onRequest: PagesFunction = async (context) => {
  const pathname = new URL(context.request.url).pathname;
  const redirect = context.request.method === "GET" || context.request.method === "HEAD"
    ? pathname.startsWith("/.") ? undefined : preferencesRedirect(context.request)
    : undefined;
  return redirect ?? context.next();
};
