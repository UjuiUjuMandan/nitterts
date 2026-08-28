import { serveResetPreferences } from "../src/serve/settings";

export const onRequestPost: PagesFunction<Env> = ({ request }) => serveResetPreferences(request);
