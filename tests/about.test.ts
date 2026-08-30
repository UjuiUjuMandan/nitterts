import { describe, expect, it } from "vitest";
import { renderInline, renderMarkdown } from "../src/markdown";
import { renderSiteAboutPage } from "../src/render/site-about";
import { ABOUT_MARKDOWN } from "../src/generated/about";
import { DEFAULT_PREFERENCES } from "../src/preferences";

describe("renderMarkdown", () => {
  it("renders headings, lists, paragraphs, and links", () => {
    const html = renderMarkdown(
      [
        "# About",
        "",
        "Intro with <https://example.com> and [text](https://example.org/x?y=1&z=2).",
        "Soft wrap joins lines.",
        "",
        "- Item **bold**",
        "- Item `code` and *em*",
        "",
        "## Section",
        "",
        "Liberapay: https://liberapay.com/zedeus \\",
        "Patreon: https://patreon.com/nitter",
        "",
        "[xss](javascript:alert(1)) stays inert",
      ].join("\n"),
    );
    expect(html).toContain("<h1>About</h1>");
    expect(html).toContain('<a href="https://example.com">https://example.com</a>');
    expect(html).toContain('<a href="https://example.org/x?y=1&amp;z=2">text</a>');
    expect(html).toContain("Soft wrap joins lines.");
    expect(html).toContain('<p>Intro with <a href="https://example.com">https://example.com</a> and <a href="https://example.org/x?y=1&amp;z=2">text</a>. Soft wrap joins lines.</p>');
    expect(html).toContain("<ul><li>Item <strong>bold</strong></li><li>Item <code>code</code> and <em>em</em></li></ul>");
    expect(html).toContain("<h2>Section</h2>");
    expect(html).toContain("Liberapay: https://liberapay.com/zedeus<br>\nPatreon:");
    expect(html).not.toContain("javascript:");
  });

  it("escapes plain inline text", () => {
    expect(renderInline("a < b & c")).toBe("a &lt; b &amp; c");
  });

  it("renders the instance about.md", () => {
    const page = renderSiteAboutPage(DEFAULT_PREFERENCES);
    for (const needle of [
      "<h1>About</h1>",
      "<h2>Why use Nitter?</h2>",
      "<h2>Donating</h2>",
      '<a href="https://github.com/zedeus/nitter/wiki/Instances">instances</a>',
      "<ul>",
      "AGPLv3 licensed",
      "Instance info",
    ]) {
      expect(page).toContain(needle);
    }
    expect(ABOUT_MARKDOWN).toContain("# About");
  });
});
