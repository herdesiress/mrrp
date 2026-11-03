import test from "node:test";
import assert from "node:assert/strict";
import { normalizePages, renderSiteNavigation, slugifyPage, validPageSlug } from "./pages.mjs";

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
  assert.match(nav, /href="\.\/about\/"/);
  assert.doesNotMatch(nav, /home-button/);
});

test("internal pages link back with ../ and show a home button", () => {
  const nav = renderSiteNavigation({ pages: [{ slug: "about", title: "about" }], isHome: false });
  assert.match(nav, /class="home-button" href="\.\.\/"/);
  assert.match(nav, /href="\.\.\/about\/"/);
});

test("escapes page names in the nav", () => {
  const nav = renderSiteNavigation({ pages: [{ slug: "x", title: "<script>alert(1)</script>" }] });
  assert.doesNotMatch(nav, /<script>/);
  assert.match(nav, /&lt;script&gt;/);
});
