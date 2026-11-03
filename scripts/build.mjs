import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderMarkdownPage } from "./markdown.mjs";
import { readPageBodies, readPages, renderSiteNavigation } from "./pages.mjs";
import { defaultSiteSettings, normalizeSiteSettings, validSiteSettings } from "./site-settings.mjs";

const markdown = await readFile("content.md", "utf8");
const title = (await readFile("site-title.txt", "utf8")).trim() || "home";
let settings = defaultSiteSettings();
try {
  settings = JSON.parse(await readFile("site-settings.json", "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
if (!validSiteSettings(settings)) throw new Error("site-settings.json contains invalid site settings.");
settings = normalizeSiteSettings(settings);
const pages = await readPages(process.cwd());
const bodies = await readPageBodies(process.cwd(), pages);
const updatedAt = new Date().toISOString();
const version = process.env.GITHUB_SHA?.slice(0, 7) || "local";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await mkdir("dist/media", { recursive: true });
await cp("public/site.css", "dist/site.css");
await cp("public/site.js", "dist/site.js");
for (const filename of await readdir("public/media")) {
  if (filename === ".gitkeep") continue;
  await cp(resolve("public/media", filename), resolve("dist/media", filename));
}

await writeFile("dist/index.html", renderMarkdownPage(
  markdown, "./site.css", "./", "./site.js", title, settings, updatedAt, version,
  renderSiteNavigation({ pages, isHome: true })
));

for (const page of pages) {
  await mkdir(resolve("dist", page.slug), { recursive: true });
  await writeFile(resolve("dist", page.slug, "index.html"), renderMarkdownPage(
    bodies.get(page.slug), "site.css", "../", "site.js", page.title, settings, updatedAt, version,
    renderSiteNavigation({ pages, isHome: false })
  ));
}
