import { Marked } from "marked";
import { normalizeLanguage } from "./code-language.mjs";
import { normalizeSiteSettings } from "./site-settings.mjs";

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

const renderImage = ({ href, title, text }, blockMedia = false) => {
  const safeHref = safeUrl(href);
  if (!safeHref) return escapeHtml(text);
  const fit = title?.match(/^fit=(\d+)x(\d+)$/);
  const safeTitle = title && !fit ? ` title="${escapeHtml(title)}"` : "";
  const fitStyle = fit ? ` style="max-width:${fit[1]}px;max-height:${fit[2]}px;object-fit:contain"` : "";
  const fitData = fit ? ` data-fit-w="${fit[1]}" data-fit-h="${fit[2]}"` : "";
  const extension = safeHref.split(/[?#]/, 1)[0].split(".").at(-1)?.toLowerCase();
  const mediaName = escapeHtml(text || "media");
  if (["mp3", "m4a", "aac", "wav", "ogg", "flac"].includes(extension)) {
    const caption = blockMedia ? `<figcaption>${mediaName}</figcaption>` : `<span class="media-caption">${mediaName}</span>`;
    const element = `${caption}<audio controls preload="metadata"><source src="${escapeHtml(safeHref)}"></audio>`;
    return blockMedia ? `<figure class="audio-embed">${element}</figure>` : `<span class="audio-embed">${element}</span>`;
  }
  if (["mp4", "webm", "ogv", "mov"].includes(extension)) {
    const caption = blockMedia ? `<figcaption>${mediaName}</figcaption>` : `<span class="media-caption">${mediaName}</span>`;
    const element = `${caption}<video${fitStyle} controls playsinline preload="metadata"><source src="${escapeHtml(safeHref)}"></video><button class="video-expand" type="button">expand</button>`;
    const fitData = fit ? ` data-fit-w="${fit[1]}" data-fit-h="${fit[2]}"` : "";
    return blockMedia
      ? `<figure class="video-embed"${fitData}>${element}</figure>`
      : `<span class="video-embed"${fitData}>${element}</span>`;
  }
  return `<img src="${escapeHtml(safeHref)}" alt="${escapeHtml(text)}"${safeTitle}${fitData}${fitStyle}>`;
};

const renderer = {
  code({ text, lang }) {
    const asciiFit = lang?.match(/^ascii-fit-(\d+)x(\d+)$/i);
    if (asciiFit) {
      const width = Number(asciiFit[1]);
      const height = Number(asciiFit[2]);
      const lines = text.split("\n");
      const longest = Math.max(1, ...lines.map((line) => line.length));
      const size = Math.min(40, Math.max(1, Math.floor(Math.min(width / (longest * 0.62), height / (lines.length * 1.45)))));
      return `<pre class="ascii-art language-ascii-fit-${width}x${height}" style="max-width:${width}px;max-height:${height}px;font-size:${size}px;line-height:1.4;overflow:auto"><code>${escapeHtml(text)}</code></pre>\n`;
    }
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
    return renderImage({ href, title, text });
  }
};

const mediaBlock = {
  name: "mediaBlock",
  level: "block",
  start(source) {
    const index = source.indexOf("![");
    return index < 0 ? undefined : index;
  },
  tokenizer(source) {
    const match = source.match(/^!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)[ \t]*(?:\n+|$)/);
    if (!match || !/\.(?:mp3|m4a|aac|wav|ogg|flac|mp4|webm|ogv|mov)(?:[?#]|$)/i.test(match[2])) return;
    return {
      type: "mediaBlock",
      raw: match[0],
      href: match[2],
      title: match[3] ?? null,
      text: match[1]
    };
  },
  renderer(token) {
    return `${renderImage(token, true)}\n`;
  }
};

const discordFormatting = [
  {
    name: "underline",
    level: "inline",
    start(source) {
      const index = source.indexOf("__");
      return index < 0 ? undefined : index;
    },
    tokenizer(source) {
      const match = source.match(/^__([^_\n](?:[\s\S]*?[^_\n])?)__/);
      if (!match) return;
      return {
        type: "underline",
        raw: match[0],
        tokens: this.lexer.inlineTokens(match[1])
      };
    },
    renderer(token) {
      return `<u>${this.parser.parseInline(token.tokens)}</u>`;
    }
  },
  {
    name: "spoiler",
    level: "inline",
    start(source) {
      const index = source.indexOf("||");
      return index < 0 ? undefined : index;
    },
    tokenizer(source) {
      const match = source.match(/^\|\|([\s\S]+?)\|\|/);
      if (!match) return;
      return {
        type: "spoiler",
        raw: match[0],
        tokens: this.lexer.inlineTokens(match[1])
      };
    },
    renderer(token) {
      return `<span class="spoiler" role="button" tabindex="0" aria-label="Spoiler">${this.parser.parseInline(token.tokens)}</span>`;
    }
  }
];

const textColor = {
  name: "textColor",
  level: "inline",
  start(source) {
    const index = source.indexOf("{{color:");
    return index < 0 ? undefined : index;
  },
  tokenizer(source) {
    const header = source.match(/^\{\{color:(#[\da-f]{6});/i);
    if (!header) return;
    const contentStart = header[0].length;
    let depth = 1;
    let end = contentStart;
    while (end < source.length && depth > 0) {
      if (source.startsWith("{{color:", end)) {
        depth++;
        end += 8;
      } else if (source.startsWith("}}", end)) {
        depth--;
        if (depth === 0) break;
        end += 2;
      } else {
        end++;
      }
    }
    if (depth !== 0 || end === contentStart) return;
    const raw = source.slice(0, end + 2);
    return {
      type: "textColor",
      raw,
      color: header[1],
      tokens: this.lexer.inlineTokens(source.slice(contentStart, end))
    };
  },
  renderer(token) {
    return `<span data-text-color="${token.color.toLowerCase()}" style="color:${token.color.toLowerCase()}">${this.parser.parseInline(token.tokens)}</span>`;
  }
};

const markdown = new Marked({ gfm: true, breaks: true, renderer, extensions: [mediaBlock, ...discordFormatting, textColor] });

export const titleFromMarkdown = (source) => {
  const heading = source.match(/^#\s+(.+)$/m);
  return heading ? heading[1].replace(/[*_`~]/g, "") : "home";
};

const widgetMarkup = (settings, updatedAt) => {
  const { widgets } = normalizeSiteSettings(settings);
  const tools = [];
  if (widgets.viewCount) {
    const counterState = widgets.viewCounterEndpoint ? "loading" : "setup needed";
    tools.push(`<span class="site-view-count">view count: <span data-view-count data-view-count-endpoint="${escapeHtml(widgets.viewCounterEndpoint)}">${counterState}</span></span>`);
  }
  if (widgets.lastUpdated) {
    const updatedLabel = new Date(updatedAt).toLocaleDateString("en-AU", {
      timeZone: "Australia/Melbourne",
      day: "numeric",
      month: "short",
      year: "numeric"
    });
    tools.push(`<span class="site-updated">last updated: <time datetime="${escapeHtml(updatedAt)}">${escapeHtml(updatedLabel)}</time></span>`);
  }
  if (widgets.clocks) {
    tools.push('<span class="site-clocks"><span class="site-clock">my time: <time data-clock="melbourne">--:--</time> <span>(Melbourne, Victoria)</span></span><span class="site-clock">your time: <time data-clock="local">--:--</time></span></span>');
  }
  if (widgets.themeToggle) tools.push('<button class="theme-toggle" type="button" aria-label="Switch to light theme">light</button>');
  const header = tools.length ? `<header class="site-tools" aria-label="Site information">${tools.join("")}</header>` : "";
  const backToTop = widgets.backToTop ? '<button class="back-to-top" type="button" aria-hidden="true" tabindex="-1">back to top</button>' : "";
  return `${header}${backToTop}`;
};

const spotifyMarkup = (settings) => {
  const { spotify } = normalizeSiteSettings(settings).widgets;
  if (!spotify.enabled || !spotify.endpoint) return "";
  return `<section class="spotify-card" data-placement="${escapeHtml(spotify.placement)}" data-spotify-endpoint="${escapeHtml(spotify.endpoint)}" aria-label="spotify listening status"><div class="spotify-artwork" aria-hidden="true"></div><span class="spotify-indicator" aria-hidden="true"></span><div class="spotify-details"><span class="spotify-status" role="status">connecting to spotify status…</span><strong class="spotify-title"></strong><span class="spotify-artist"></span><div class="spotify-progress" aria-hidden="true"><span></span></div><div class="spotify-times"><time class="spotify-position">0:00</time><time class="spotify-duration">0:00</time></div><a class="spotify-link" href="https://open.spotify.com/" target="_blank" rel="noreferrer">open in spotify</a></div></section>`;
};

export const renderMarkdownPage = (source, stylesheet = "./site.css", baseHref = "./", script = "./site.js", pageTitle, settings = {}, updatedAt = new Date().toISOString()) => {
  const siteSettings = normalizeSiteSettings(settings);
  const title = pageTitle ?? titleFromMarkdown(source);
  let html = markdown.parse(source);
  const motifCount = Math.max(1, Math.min(20, siteSettings.motif.count));
  const motif = `<div class="floating-motif" data-enabled="${Boolean(siteSettings.motif.enabled)}" data-symbol="${escapeHtml(siteSettings.motif.symbol)}" data-count="${motifCount}" aria-hidden="true"></div>`;
  const spotify = spotifyMarkup(siteSettings);
  const pinnedSpotify = ["fixed-bottom-right", "fixed-bottom-left"].includes(siteSettings.widgets.spotify.placement) ? spotify : "";
  if (spotify && !pinnedSpotify) {
    const placement = siteSettings.widgets.spotify.placement;
    const heading = placement === "top" ? /<\/h1>/i : null;
    const intro = placement === "after-intro" ? /<\/p>/i : null;
    const anchor = (heading ?? intro)?.exec(html);
    if (anchor) html = `${html.slice(0, anchor.index + anchor[0].length)}\n${spotify}${html.slice(anchor.index + anchor[0].length)}`;
    else if (placement === "bottom") html += `\n${spotify}`;
    else html = `${spotify}\n${html}`;
  }
  const faviconUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%23111'/%3E%3Ctext x='32' y='43' fill='%238db4ff' font-family='monospace' font-size='32' text-anchor='middle'%3E%3B3%3C/text%3E%3C/svg%3E";
  const favicon = `<link rel="icon" href="${escapeHtml(faviconUrl)}">`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#111111">
    <title>${escapeHtml(title)}</title>
    <base href="${escapeHtml(baseHref)}">
    ${favicon}
    <link rel="stylesheet" href="${stylesheet}">
    <script src="${escapeHtml(script)}" defer></script>
  </head>
  <body>
    ${widgetMarkup(siteSettings, updatedAt)}
    ${motif}
    ${pinnedSpotify}
    <main class="page">${html}</main>
  </body>
</html>
`;
};
