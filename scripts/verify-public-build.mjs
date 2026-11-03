import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeSiteSettings } from "./site-settings.mjs";

const settings = normalizeSiteSettings(JSON.parse(await readFile("site-settings.json", "utf8")));
const html = await readFile("dist/index.html", "utf8");
const files = await readdir("dist");
const expectedFiles = ["index.html", "media", "site.css", "site.js"];
if (files.length !== expectedFiles.length || expectedFiles.some((file) => !files.includes(file))) {
  throw new Error("Public build contains unexpected files or is missing expected public assets.");
}
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
