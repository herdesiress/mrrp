import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const pagesManifest = "pages.json";
export const pagesDirectory = "pages";
export const validPageSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const maxPages = 60;
const maxCategories = 40;

export const slugifyPage = (title, fallback = "page") => {
  const slug = String(title ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
};

const cleanText = (value, limit) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);

// Pages carry their category; categories carry their own order. Both orders are
// independent so moving a category never reshuffles the pages inside it.
export const normalizePageManifest = (value) => {
  const list = Array.isArray(value) ? value : Array.isArray(value?.pages) ? value.pages : [];
  const seen = new Set();
  const pages = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const slug = String(entry.slug ?? "").trim().toLowerCase();
    const title = cleanText(entry.title, 60);
    if (!validPageSlug.test(slug) || !title || seen.has(slug)) continue;
    seen.add(slug);
    const category = cleanText(entry.category, 40);
    pages.push(category ? { slug, title, category } : { slug, title });
    if (pages.length >= maxPages) break;
  }

  const used = new Set(pages.map((page) => page.category).filter(Boolean));
  const requested = (Array.isArray(value?.categories) ? value.categories : [])
    .map((category) => cleanText(category, 40))
    .filter((category) => category && used.has(category));
  const categories = [...new Set(requested)];
  for (const page of pages) {
    if (page.category && !categories.includes(page.category)) categories.push(page.category);
  }
  return { categories: categories.slice(0, maxCategories), pages };
};

export const normalizePages = (value) => normalizePageManifest(value).pages;

export const readPageManifest = async (root) => {
  try {
    return normalizePageManifest(JSON.parse(await readFile(resolve(root, pagesManifest), "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return { categories: [], pages: [] };
    throw error;
  }
};

export const readPages = async (root) => (await readPageManifest(root)).pages;

export const writePages = async (root, pages, categories = []) => {
  const normalized = normalizePageManifest({ categories, pages });
  await writeFile(resolve(root, pagesManifest), `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
};

export const pageBodyPath = (root, slug) => resolve(root, pagesDirectory, `${slug}.md`);

export const readPageBody = async (root, slug) => {
  if (!validPageSlug.test(slug)) return null;
  try {
    return await readFile(pageBodyPath(root, slug), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};

export const readPageBodies = async (root, pages) => {
  const bodies = new Map();
  await Promise.all(pages.map(async (page) => {
    bodies.set(page.slug, (await readPageBody(root, page.slug)) ?? `# ${page.title}\n`);
  }));
  return bodies;
};

// Slugs that already have a markdown file but are not in the manifest still get
// edited, so a half-finished page never silently disappears from the editor.
export const allPageSlugs = async (root, pages) => {
  const listed = new Set(pages.map((page) => page.slug));
  try {
    for (const file of await readdir(resolve(root, pagesDirectory))) {
      if (file.endsWith(".md")) listed.add(file.slice(0, -3));
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return [...listed].filter((slug) => validPageSlug.test(slug));
};

const escapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const homeIcon = '<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 10.6 12 3.8l8.5 6.8"/><path d="M5.8 9.4V20h12.4V9.4"/><path d="M10 20v-5.2h4V20"/></svg>';

const pageLink = (page) =>
  `<a href="./${escapeHtml(page.slug)}/" data-page-slug="${escapeHtml(page.slug)}">${escapeHtml(page.title)}</a>`;

// Pages are grouped by category and stacked, one link per line. Uncategorised
// pages come after the named groups.
export const renderSiteNavigation = ({ pages = [], categories = [], isHome = true } = {}) => {
  const groups = [];
  for (const category of categories) {
    const members = pages.filter((page) => page.category === category);
    if (members.length) groups.push({ category, members });
  }
  const loose = pages.filter((page) => !page.category || !categories.includes(page.category));
  if (loose.length) groups.push({ category: "", members: loose });

  const home = isHome ? "" : `<a class="home-button" href="./" data-page-slug="home" aria-label="Back to home" title="home">${homeIcon}</a>`;
  if (!groups.length) return { home, pages: "" };
  const body = groups.map(({ category, members }) => {
    const heading = category ? `<span class="site-pages-category">${escapeHtml(category)}</span>` : "";
    return `<div class="site-pages-group">${heading}${members.map(pageLink).join("")}</div>`;
  }).join("");
  return {
    home,
    pages: `<nav class="site-pages" aria-label="Pages"><span class="site-pages-heading">pages</span>${body}</nav>`
  };
};
