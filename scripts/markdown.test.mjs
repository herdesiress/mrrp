import assert from "node:assert/strict";
import test from "node:test";
import { renderMarkdownPage } from "./markdown.mjs";

test("keeps Markdown blocks, inline emphasis, links, tables, and code blocks distinct", () => {
  const html = renderMarkdownPage(
    "# heading\n\nfirst paragraph\n\nsecond **bold** and *italic* [link](https://example.com)\n\n```js\nconst value = 1;\n```\n\n| A | B |\n| - | - |\n| one | two |",
    "./site.css",
    "./",
    "./site.js",
    "tab title"
  );
  assert.match(html, /<title>tab title<\/title>/);
  assert.match(html, /<h1>heading<\/h1>\s*<p>first paragraph<\/p>\s*<p>second <strong>bold<\/strong> and <em>italic<\/em>/);
  assert.match(html, /<a href="https:\/\/example\.com"/);
  assert.match(html, /<span class="code-language">JavaScript<\/span><pre><code>const value = 1;<\/code><\/pre>/);
  assert.match(html, /<table>[\s\S]*<td>one<\/td>[\s\S]*<td>two<\/td>[\s\S]*<\/table>/);
});

test("renders standalone media as valid visible block elements and preserves fit bounds", () => {
  const html = renderMarkdownPage(
    '![photo](./media/photo.png "fit=180x120")\n\n![sound](./media/sound.mp3)\n\n![clip](./media/clip.mp4 "fit=200x100")'
  );
  assert.match(html, /data-fit-w="180" data-fit-h="120" style="max-width:180px;max-height:120px;object-fit:contain"/);
  assert.match(html, /<figure class="audio-embed"><figcaption>sound<\/figcaption><audio controls preload="metadata"><source src="\.\/media\/sound\.mp3"><\/audio><\/figure>/);
  assert.match(html, /<figure class="video-embed" data-fit-w="200" data-fit-h="100">/);
  assert.match(html, /<video style="max-width:200px;max-height:100px;object-fit:contain"/);
  assert.doesNotMatch(html, /<p><figure class="(?:audio|video)-embed"/);
});

test("renders and preserves text color markup without raw HTML", () => {
  const html = renderMarkdownPage("before {{color:#8db4ff;blue **bold**}} after");
  assert.match(html, /<span data-text-color="#8db4ff" style="color:#8db4ff">blue <strong>bold<\/strong><\/span>/);
  const nested = renderMarkdownPage("{{color:#8db4ff;blue {{color:#f2b5b5;rose}}}}");
  assert.match(nested, /<span data-text-color="#8db4ff" style="color:#8db4ff">blue <span data-text-color="#f2b5b5" style="color:#f2b5b5">rose<\/span><\/span>/);
});

test("keeps drawn ASCII bounds in the code language through rendering", () => {
  const html = renderMarkdownPage("```ascii-fit-220x120\n /\\\n( o.o )\n```");
  assert.match(html, /<pre class="ascii-art language-ascii-fit-220x120"/);
  assert.match(html, /max-width:220px;max-height:120px/);
  assert.match(html, /<code> \/\\\n\( o\.o \)<\/code>/);
});

test("renders Discord underline and interactive spoiler syntax", () => {
  const html = renderMarkdownPage("__underlined__ and ||hidden **text**||");
  assert.match(html, /<u>underlined<\/u>/);
  assert.match(html, /<span class="spoiler" role="button" tabindex="0" aria-label="Spoiler">hidden <strong>text<\/strong><\/span>/);
});

test("renders Discord headings, dividers, inline code, and fenced code", () => {
  const html = renderMarkdownPage("# Heading\n\n---\n\n`single line`\n\n```js\nconst value = 1;\n```");
  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /<hr>/);
  assert.match(html, /<code>single line<\/code>/);
  assert.match(html, /<pre><code>const value = 1;<\/code><\/pre>/);
});

test("renders the configured floating text count with a safe default", () => {
  const defaultHtml = renderMarkdownPage("text");
  const configuredHtml = renderMarkdownPage("text", "./site.css", "./", "./site.js", "title", {
    motif: { enabled: true, symbol: ";3", count: 8 }
  });
  assert.match(defaultHtml, /data-count="3"/);
  assert.match(configuredHtml, /data-enabled="true" data-symbol=";3" data-count="8"/);
});

test("renders enabled visitor tools with an inline favicon and without editor controls", () => {
  const html = renderMarkdownPage("# hi\n\nintro", "./site.css", "./", "./site.js", "title", {
    motif: { enabled: false, symbol: "", count: 3 },
    widgets: {
      viewCount: true,
      lastUpdated: true,
      clocks: true,
      themeToggle: true,
      backToTop: true,
      spotify: { enabled: false, endpoint: "", placement: "after-intro" }
    }
  }, "2026-11-03T00:00:00.000Z");
  assert.match(html, /view count: <span data-view-count data-view-count-endpoint="">setup needed<\/span>/);
  assert.match(html, /last updated: <time datetime="2026-11-03T00:00:00\.000Z">3 Nov 2026<\/time>/);
  assert.match(html, /data-clock="melbourne"/);
  assert.match(html, /data-clock="local"/);
  assert.match(html, /my time: <time data-clock="melbourne">--:--<\/time> <span>\(Melbourne, Victoria\)<\/span>/);
  assert.match(html, /your time: <time data-clock="local">--:--<\/time>/);
  assert.match(html, /class="theme-toggle"/);
  assert.match(html, /class="back-to-top"/);
  assert.match(html, /class="site-tools-close"[^>]*>×<\/button>/);
  assert.match(html, /class="site-tools-reopen"[^>]*hidden>site info<\/button>/);
  assert.match(html, /rel="icon" href="data:image\/svg\+xml/);
  assert.doesNotMatch(html, /editor\.html/);
});

test("pins the listening card in the lower-right corner", () => {
  const html = renderMarkdownPage("# hi\n\nintro paragraph\n\nnext paragraph", "./site.css", "./", "./site.js", "title", {
    motif: { enabled: false, symbol: "", count: 3 },
    widgets: {
      viewCount: false,
      viewCounterEndpoint: "",
      lastUpdated: false,
      clocks: false,
      themeToggle: false,
      backToTop: false,
      spotify: { enabled: true, endpoint: "https://status.example/now-playing", placement: "fixed-bottom-right" }
    }
  });
  assert.match(html, /class="spotify-card" data-placement="fixed-bottom-right"/);
  assert.match(html, /data-spotify-endpoint="https:\/\/status\.example\/now-playing"/);
  assert.match(html, /<div class="floating-motif"[\s\S]*<\/div>\s*<section class="spotify-card" data-placement="fixed-bottom-right"/);
});

test("pins the listening card in the lower-left corner", () => {
  const html = renderMarkdownPage("# hi", "./site.css", "./", "./site.js", "title", {
    widgets: { spotify: { enabled: true, endpoint: "https://status.example/now-playing", placement: "fixed-bottom-left" } }
  });
  assert.match(html, /class="spotify-card" data-placement="fixed-bottom-left"/);
  assert.match(html, /class="spotify-indicator"/);
  assert.match(html, /connecting to spotify status/);
});

test("does not render a broken Spotify card when no status endpoint is configured", () => {
  const html = renderMarkdownPage("# hi", "./site.css", "./", "./site.js", "title", {
    widgets: { spotify: { enabled: true, endpoint: "", placement: "fixed-bottom-right" } }
  });
  assert.doesNotMatch(html, /spotify-card/);
});

test("renders optional games closed with the Connect Four board and visitor toggle", () => {
  const disabled = renderMarkdownPage("# hi");
  assert.doesNotMatch(disabled, /games-toggle|connect-four-board/);
  const enabled = renderMarkdownPage("# hi", "./site.css", "./", "./site.js", "title", {
    games: { enabled: true }
  });
  assert.match(enabled, /class="games-toggle"[^>]*aria-expanded="false"/);
  assert.match(enabled, /class="games-panel" hidden/);
  assert.equal((enabled.match(/class="connect-four-column"/g) ?? []).length, 7);
  assert.match(enabled, /your turn · drop a disc/);
});

test("renders a visitor-controlled Spotify card and reopen toggle", () => {
  const html = renderMarkdownPage("# hi", "./site.css", "./", "./site.js", "title", {
    widgets: { spotify: { enabled: true, endpoint: "https://status.example/now-playing", placement: "fixed-bottom-left" } }
  });
  assert.match(html, /class="spotify-close"[^>]*>×<\/button>/);
  assert.match(html, /class="spotify-reopen"[^>]*data-placement="fixed-bottom-left"[^>]*hidden>spotify<\/button>/);
});
