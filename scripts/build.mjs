import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderMarkdownPage } from "./markdown.mjs";

const markdown = await readFile("content.md", "utf8");
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await mkdir("dist/media", { recursive: true });
await cp("public/site.css", "dist/site.css");
await cp("public/site.js", "dist/site.js");
for (const filename of await readdir("public/media")) {
  if (filename === ".gitkeep") continue;
  await cp(resolve("public/media", filename), resolve("dist/media", filename));
}
await writeFile("dist/index.html", renderMarkdownPage(markdown));
