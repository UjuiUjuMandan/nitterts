// Minimal Markdown renderer covering the subset used by about.md:
// headings, bullet lists, paragraphs with hard breaks, links, autolinks,
// emphasis, and inline code. Escapes all user text.

import { escapeAttribute, escapeHtml } from "./render/profile";

export function renderMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flushParagraph = (): void => {
    if (!paragraph.length) return;
    const hardBreaks = paragraph.map((line) => /\\\s*$/.test(line));
    const stripped = paragraph.map((line) => line.replace(/\s*\\$/, ""));
    let text = "";
    stripped.forEach((line, index) => {
      text += renderInline(line);
      if (index < stripped.length - 1) text += hardBreaks[index] ? "<br>\n" : " ";
    });
    html.push(`<p>${text}</p>`);
    paragraph = [];
  };
  const flushList = (): void => {
    if (!list.length) return;
    html.push(`<ul>${list.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
    list = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading?.[1] !== undefined && heading[2] !== undefined) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet?.[1] !== undefined) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }
    flushList();
    paragraph.push(trimmed);
  }
  flushParagraph();
  flushList();
  return html.join("\n");
}

const INLINE_TOKEN = /`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|<https?:\/\/[^>\s]+>|\[[^\]]+\]\([^)\s]+\)/g;

export function renderInline(text: string): string {
  let result = "";
  let last = 0;
  for (const match of text.matchAll(INLINE_TOKEN)) {
    const index = match.index ?? 0;
    result += escapeHtml(text.slice(last, index));
    result += renderToken(match[0]);
    last = index + match[0].length;
  }
  return result + escapeHtml(text.slice(last));
}

function renderToken(token: string): string {
  const code = /^`([^`]+)`$/.exec(token);
  if (code?.[1] !== undefined) return `<code>${escapeHtml(code[1])}</code>`;
  const bold = /^\*\*([^*]+)\*\*$/.exec(token);
  if (bold?.[1] !== undefined) return `<strong>${escapeHtml(bold[1])}</strong>`;
  const italic = /^\*([^*]+)\*$/.exec(token);
  if (italic?.[1] !== undefined) return `<em>${escapeHtml(italic[1])}</em>`;
  const autolink = /^<(https?:\/\/[^>\s]+)>$/.exec(token);
  if (autolink?.[1] !== undefined) return link(autolink[1], autolink[1]);
  const linkMatch = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token);
  if (linkMatch?.[1] !== undefined && linkMatch[2] !== undefined) return link(linkMatch[2], linkMatch[1]);
  return escapeHtml(token);
}

function link(href: string, text: string): string {
  if (!/^https?:\/\//i.test(href)) return escapeHtml(text);
  return `<a href="${escapeAttribute(href)}">${escapeHtml(text)}</a>`;
}
