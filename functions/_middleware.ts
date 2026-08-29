import { preferencesRedirect } from "../src/preferences";

export const onRequest: PagesFunction = async (context) => {
  const redirect = context.request.method === "GET" || context.request.method === "HEAD"
    ? preferencesRedirect(context.request)
    : undefined;
  return redirect ?? context.next();
};
