import { serveSessionSettingsPage, serveSessionSettingsUpdate } from "../../src/serve/session-settings";

export const onRequestGet: PagesFunction<Env> = ({ request, env }) => serveSessionSettingsPage(request, env);
export const onRequestPost: PagesFunction<Env> = ({ request, env }) => serveSessionSettingsUpdate(request, env);
