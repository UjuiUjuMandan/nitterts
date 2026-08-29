import { preferencesFromRequest } from "../src/preferences";
import { renderSiteAboutPage } from "../src/render/site-about";

export const onRequestGet: PagesFunction = ({ request }) => new Response(
  renderSiteAboutPage(preferencesFromRequest(request)),
  {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'self'; img-src 'self' data:; media-src 'self' blob: https://video.twimg.com; script-src 'self' 'unsafe-hashes' 'sha256-/Z4pjjEaN4JuXiqMBajQpiZZINsH7QgIOYHQmRoj740='; worker-src 'self' blob:; connect-src 'self' https://video.twimg.com; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      vary: "Cookie",
    },
  },
);
