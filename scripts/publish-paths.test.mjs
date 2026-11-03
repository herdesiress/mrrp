import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { publishedPaths } from "./publish-paths.mjs";

const buildSource = await readFile(new URL("./build.mjs", import.meta.url), "utf8");

const shippedPublicFiles = [
  ...new Set([
    ...[...buildSource.matchAll(/\b(?:cp|readdir|readFile)\("(public\/[^"]+)"/g)].map((match) => match[1]),
    ...[...buildSource.matchAll(/resolve\("(public\/[^"]+)"/g)].map((match) => match[1])
  ])
];

const isPublished = (path) =>
  publishedPaths.some((published) => path === published || path.startsWith(`${published}/`));

test("every public file the site build ships is published by the editor", () => {
  assert.ok(shippedPublicFiles.length >= 2, "expected build.mjs to copy public assets");
  for (const path of shippedPublicFiles) {
    assert.ok(isPublished(path), `${path} is shipped by build.mjs but never committed by the editor`);
  }
});

test("site assets are published alongside the page content", () => {
  assert.ok(publishedPaths.includes("public/site.css"));
  assert.ok(publishedPaths.includes("public/site.js"));
  for (const path of ["content.md", "site-title.txt", "site-settings.json", "public/media"]) {
    assert.ok(publishedPaths.includes(path), `${path} must keep being published`);
  }
});
