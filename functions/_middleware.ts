import { installPreferenceDefaults, preferencesRedirect } from "../src/preferences";
import { installMetricsSink } from "../src/x/metrics-sink";

export const onRequest: PagesFunction<Env> = async (context) => {
  installPreferenceDefaults(context.env);
  installMetricsSink(context.env.HEALTH_METRICS);
  const pathname = new URL(context.request.url).pathname;
  const redirect = context.request.method === "GET" || context.request.method === "HEAD"
    ? pathname.startsWith("/.") ? undefined : preferencesRedirect(context.request)
    : undefined;
  return redirect ?? context.next();
};
