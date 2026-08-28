import { serveSavePreferences } from "../src/serve/settings";

export const onRequestPost: PagesFunction<Env> = ({ request }) => serveSavePreferences(request);
