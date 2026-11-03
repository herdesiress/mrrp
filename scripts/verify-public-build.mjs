import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { readPages } from "./pages.mjs";
import { normalizeSiteSettings } from "./site-settings.mjs";

const settings = normalizeSiteSettings(JSON.parse(await readFile("site-settings.json", "utf8")));
const pages = await readPages(process.cwd());
const html = await readFile("dist/index.html", "utf8");
const files = await readdir("dist");
const expectedFiles = ["index.html", "media", "site.css", "site.js", ...pages.map((page) => page.slug)].sort();
if (files.length !== expectedFiles.length || expectedFiles.some((file) => !files.includes(file))) {
  throw new Error("Public build contains unexpected files or is missing expected public assets.");
}
for (const page of pages) {
  const pageHtml = await readFile(resolve("dist", page.slug, "index.html"), "utf8");
  const base = pageHtml.match(/<base href="([^"]+)"/)?.[1];
  const stylesheet = pageHtml.match(/<link rel="stylesheet" href="([^"]+)"/)?.[1];
  const home = pageHtml.match(/class="home-button" href="([^"]+)"/)?.[1];
  const link = pageHtml.match(new RegExp(`<a href="([^"]+)" data-page-slug="${page.slug}"`))?.[1];
  if (!base || !stylesheet || !home || !link) throw new Error(`Page ${page.slug} is missing its base, stylesheet, home button or nav link.`);
  // Resolve the way a browser does: against <base>, not the document URL. A
  // stray ../ here silently 404s the whole stylesheet.
  const at = (href) => new URL(href, new URL(base, `https://site.test/${page.slug}/`)).pathname;
  if (at(stylesheet) !== "/site.css") throw new Error(`Page ${page.slug} resolves its stylesheet to ${at(stylesheet)} instead of /site.css.`);
  if (at(home) !== "/") throw new Error(`Page ${page.slug} sends its home button to ${at(home)} instead of /.`);
  if (at(link) !== `/${page.slug}/`) throw new Error(`Page ${page.slug} links itself to ${at(link)} instead of /${page.slug}/.`);
}
if (pages.length && !html.includes('class="site-pages"')) throw new Error("Home page is missing the pages list.");
const required = [
  [settings.motif.enabled, /<div class="floating-motif" data-enabled="true"/, "floating text"],
  [settings.widgets.viewCount, /class="site-view-count"/, "view counter"],
  [settings.widgets.lastUpdated, /class="site-updated"/, "last updated"],
  [settings.widgets.clocks, /class="site-clocks"/, "clocks"],
  [settings.widgets.themeToggle, /class="theme-toggle"/, "theme toggle"],
  [settings.widgets.backToTop, /class="back-to-top"/, "back-to-top button"],
  [settings.widgets.spotify.enabled && Boolean(settings.widgets.spotify.endpoint), /class="spotify-card"/, "Spotify card"],
  [settings.games.enabled && settings.games.connectFour, /class="games-toggle"/, "games toggle"]
];

for (const [enabled, pattern, label] of required) {
  if (enabled && !pattern.test(html)) throw new Error(`Public build is missing the configured ${label}.`);
}

if (files.some((file) => /^editor\.(?:html|css|js)$/.test(file))) {
  throw new Error("Editor-only files must not be included in the public build.");
}

await Promise.all(["site.css", "site.js"].map((file) => access(resolve("dist", file))));
const publicMedia = (await readdir("public/media")).filter((file) => file !== ".gitkeep").sort();
const builtMedia = (await readdir("dist/media")).sort();
if (publicMedia.length !== builtMedia.length || publicMedia.some((file, index) => file !== builtMedia[index])) {
  throw new Error("Public build media does not match the public media directory.");
}

const content = await readFile("content.md", "utf8");
const mediaReferences = [...content.matchAll(/!\[[^\]]*\]\((?:\.\/)?media\/([^)\s]+)(?:\s+"[^"]*")?\)/g)];
await Promise.all(mediaReferences.map(([, filename]) => access(resolve("dist/media", filename))));
