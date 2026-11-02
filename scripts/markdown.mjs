import { Marked } from "marked";
import { normalizeLanguage } from "./code-language.mjs";

const escapeHtml = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const safeUrl = (value) => {
  try {
    const url = new URL(value, "https://local.invalid");
    if (["https:", "http:", "mailto:"].includes(url.protocol)) return value;
    if (value.startsWith("#") || value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
      return value;
    }
  } catch {}
  return "";
};

const renderer = {
  code({ text, lang }) {
    const language = normalizeLanguage(lang ?? "", text);
    return `<div class="code-block"><span class="code-language">${escapeHtml(language)}</span><pre><code>${escapeHtml(text)}</code></pre></div>\n`;
  },
  html({ text }) {
    return escapeHtml(text);
  },
  link({ href, title, tokens }) {
    const safeHref = safeUrl(href);
    const label = this.parser.parseInline(tokens);
    if (!safeHref) return label;
    const safeTitle = title ? ` title="${escapeHtml(title)}"` : "";
    const external = /^https?:/i.test(safeHref) ? ' rel="noreferrer"' : "";
    return `<a href="${escapeHtml(safeHref)}"${safeTitle}${external}>${label}</a>`;
  },
  image({ href, title, text }) {
    const safeHref = safeUrl(href);
    if (!safeHref) return escapeHtml(text);
    const safeTitle = title ? ` title="${escapeHtml(title)}"` : "";
    const extension = safeHref.split(/[?#]/, 1)[0].split(".").at(-1)?.toLowerCase();
    const mediaName = escapeHtml(title || text || "media");
    if (["mp3", "m4a", "aac", "wav", "ogg", "flac"].includes(extension)) {
      return `<figure class="audio-embed"><figcaption>${mediaName}</figcaption><audio controls autoplay preload="metadata"><source src="${escapeHtml(safeHref)}"></audio></figure>`;
    }
    if (["mp4", "webm", "ogv", "mov"].includes(extension)) {
      return `<figure class="video-embed"><figcaption>${mediaName}</figcaption><video controls playsinline preload="metadata"><source src="${escapeHtml(safeHref)}"></video><button class="video-expand" type="button">expand</button></figure>`;
    }
    return `<img src="${escapeHtml(safeHref)}" alt="${escapeHtml(text)}"${safeTitle}>`;
  }
};

const markdown = new Marked({ gfm: true, breaks: true, renderer });

export const titleFromMarkdown = (source) => {
  const heading = source.match(/^#\s+(.+)$/m);
  return heading ? heading[1].replace(/[*_`~]/g, "") : "home";
};

export const renderMarkdownPage = (source, stylesheet = "./site.css", baseHref = "./", script = "./site.js", pageTitle) => {
  const title = pageTitle ?? titleFromMarkdown(source);
  const html = markdown.parse(source);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#111111">
    <title>${escapeHtml(title)}</title>
    <base href="${escapeHtml(baseHref)}">
    <link rel="stylesheet" href="${stylesheet}">
    <script src="${escapeHtml(script)}" defer></script>
  </head>
  <body>
    <main class="page">${html}</main>
  </body>
</html>
`;
};
