import { serveSavePreferences, serveSettingsPage } from "../src/serve/settings";

export const onRequestGet: PagesFunction<Env> = ({ request }) => serveSettingsPage(request);
export const onRequestPost: PagesFunction<Env> = ({ request }) => serveSavePreferences(request);
