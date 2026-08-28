import { preferencesFromRequest } from "../src/preferences";
import { renderHomePage } from "../src/render/home";

export const onRequestGet: PagesFunction<Env> = ({ request }) => new Response(
  renderHomePage(preferencesFromRequest(request)),
  {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      vary: "Cookie",
    },
  },
);
