import test from "node:test";
import assert from "node:assert/strict";
import { normalizePageManifest, normalizePages, renderSiteNavigation, slugifyPage, validPageSlug } from "./pages.mjs";

test("slugifies page names into url-safe slugs", () => {
  assert.equal(slugifyPage("About Me"), "about-me");
  assert.equal(slugifyPage("  Things & Stuff  "), "things-stuff");
  assert.equal(slugifyPage("café ;3"), "cafe-3");
  assert.equal(slugifyPage("!!!"), "page");
  assert.equal(slugifyPage("a".repeat(90)).length <= 60, true);
  assert.equal(validPageSlug.test(slugifyPage("Mixed CASE 2024!")), true);
});

test("normalizes the page manifest and drops anything unsafe", () => {
  const pages = normalizePages({
    pages: [
      { slug: "about", title: "about", category: "me" },
      { slug: "About", title: "duplicate case" },
      { slug: "../evil", title: "path" },
      { slug: "about", title: "duplicate" },
      { slug: "links", title: "  links   page  " },
      { slug: "empty", title: "   " },
      "nope"
    ]
  });
  assert.deepEqual(pages, [
    { slug: "about", title: "about", category: "me" },
    { slug: "links", title: "links page" }
  ]);
});

test("accepts the legacy bare array and rejects junk", () => {
  assert.deepEqual(normalizePages([{ slug: "a", title: "a" }]), [{ slug: "a", title: "a" }]);
  assert.deepEqual(normalizePages(null), []);
  assert.deepEqual(normalizePages("nope"), []);
});

test("home links pages relative to itself and has no home button", () => {
  const nav = renderSiteNavigation({ pages: [{ slug: "about", title: "about" }], isHome: true });
  assert.match(nav.pages, /href="\.\/about\/"/);
  assert.match(nav.pages, /data-page-slug="about"/);
  assert.equal(nav.home, "");
});

test("inner pages link back to the site root and show a home button", () => {
  const nav = renderSiteNavigation({ pages: [{ slug: "about", title: "about" }], isHome: false });
  assert.match(nav.home, /class="home-button" href="\.\/"/);
  assert.match(nav.home, /data-page-slug="home"/);
  assert.match(nav.pages, /href="\.\/about\/"/);
});

test("escapes page names in the nav", () => {
  const nav = renderSiteNavigation({ pages: [{ slug: "x", title: "<script>alert(1)</script>" }] });
  assert.doesNotMatch(nav.pages, /<script>/);
  assert.match(nav.pages, /&lt;script&gt;/);
});

test("keeps an explicit category order and appends new ones", () => {
  const manifest = normalizePageManifest({
    categories: ["life"],
    pages: [
      { slug: "a", title: "a", category: "misc" },
      { slug: "b", title: "b", category: "life" },
      { slug: "c", title: "c" }
    ]
  });
  assert.deepEqual(manifest.categories, ["life", "misc"]);
  assert.equal(manifest.pages.length, 3);
});

test("renders categories as headings with their pages underneath", () => {
  const nav = renderSiteNavigation({
    pages: [
      { slug: "a", title: "a", category: "misc" },
      { slug: "b", title: "b", category: "life" },
      { slug: "c", title: "c", category: "misc" },
      { slug: "d", title: "d" }
    ],
    categories: ["life", "misc"]
  });
  assert.match(nav.pages, /class="site-pages-category">life</);
  assert.match(nav.pages, /class="site-pages-category">misc</);
  const life = nav.pages.indexOf(">life<");
  const misc = nav.pages.indexOf(">misc<");
  const loose = nav.pages.indexOf('data-page-slug="d"');
  assert.ok(life < misc, "categories follow the given order");
  assert.ok(misc < loose, "uncategorised pages come last");
  assert.ok(nav.pages.indexOf('data-page-slug="a"') < nav.pages.indexOf('data-page-slug="c"'), "pages keep their order inside a category");
});

test("escapes category names", () => {
  const nav = renderSiteNavigation({ pages: [{ slug: "x", title: "x", category: "<b>" }], categories: ["<b>"] });
  assert.doesNotMatch(nav.pages, /<b>/);
  assert.match(nav.pages, /&lt;b&gt;/);
});
