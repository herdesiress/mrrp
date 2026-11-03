// Everything the editor owns end to end. If a file the public build ships is
// missing from this list it stays dirty in the working tree forever: the site
// never picks it up and the next push is rejected. Keep it in sync with
// scripts/build.mjs; publish-paths.test.mjs enforces that.
export const siteAssetPaths = ["public/site.css", "public/site.js"];

export const siteContentPaths = ["content.md", "site-title.txt", "site-settings.json", "public/media"];

export const sitePagePaths = ["pages.json", "pages"];

export const publishedPaths = [...siteContentPaths, ...sitePagePaths, ...siteAssetPaths];
