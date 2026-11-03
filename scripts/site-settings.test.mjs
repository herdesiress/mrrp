import assert from "node:assert/strict";
import test from "node:test";
import { defaultSiteSettings, normalizeSiteSettings, resolveSiteToolsPlacement, validSiteSettings } from "./site-settings.mjs";

test("normalizes existing motif-only settings with visitor feature defaults", () => {
  const settings = normalizeSiteSettings({ motif: { enabled: true, symbol: ";3", count: 3 } });
  assert.equal(settings.widgets.viewCount, true);
  assert.equal(settings.widgets.viewCounterEndpoint, "");
  assert.equal(settings.widgets.spotify.enabled, false);
  assert.equal(settings.widgets.spotify.placement, "fixed-bottom-right");
  assert.equal(settings.games.enabled, false);
  assert.equal(settings.games.connectFour, true);
  assert.equal(validSiteSettings(settings), true);
  assert.deepEqual(normalizeSiteSettings({ games: { enabled: true } }).games, {
    enabled: true,
    connectFour: true
  });
});

test("validates the overall games setting", () => {
  const settings = defaultSiteSettings();
  settings.games.enabled = true;
  assert.equal(validSiteSettings(settings), true);
  settings.games.enabled = "yes";
  assert.equal(validSiteSettings(settings), false);
  settings.games.enabled = true;
  settings.games.connectFour = false;
  assert.equal(validSiteSettings(settings), true);
  settings.games.connectFour = "yes";
  assert.equal(validSiteSettings(settings), false);
});

test("accepts public Spotify URLs but rejects credential-bearing settings", () => {
  const settings = defaultSiteSettings();
  settings.widgets.spotify.endpoint = "https://status.example/now-playing";
  assert.equal(validSiteSettings(settings), true);
  settings.widgets.spotify.endpoint = "https://user:secret@status.example/now-playing";
  assert.equal(validSiteSettings(settings), false);
});

test("allows the loopback DiscSpot endpoint but rejects non-local HTTP URLs", () => {
  const settings = defaultSiteSettings();
  settings.widgets.spotify.endpoint = "http://127.0.0.1:4175/now-playing";
  assert.equal(validSiteSettings(settings), true);
  settings.widgets.spotify.endpoint = "http://status.example/now-playing";
  assert.equal(validSiteSettings(settings), false);
});

test("accepts pinned Spotify card positions", () => {
  const settings = defaultSiteSettings();
  settings.widgets.spotify.placement = "fixed-bottom-right";
  assert.equal(validSiteSettings(settings), true);
  settings.widgets.spotify.placement = "fixed-bottom-left";
  assert.equal(validSiteSettings(settings), true);
});

test("validates the public view counter endpoint", () => {
  const settings = defaultSiteSettings();
  settings.widgets.viewCounterEndpoint = "https://mrrp-view-counter.example.workers.dev/";
  assert.equal(validSiteSettings(settings), true);
  settings.widgets.viewCounterEndpoint = "http://counter.example/";
  assert.equal(validSiteSettings(settings), false);
});

test("validates the site info corner", () => {
  const settings = defaultSiteSettings();
  assert.equal(settings.widgets.siteToolsPlacement, "top-right");
  assert.equal(validSiteSettings(settings), true);
  settings.widgets.siteToolsPlacement = "middle";
  assert.equal(validSiteSettings(settings), false);
});

test("keeps the info box out of the corner the listening card owns", () => {
  const settings = defaultSiteSettings();
  settings.widgets.spotify = { enabled: true, endpoint: "https://status.example/now-playing", placement: "fixed-bottom-right" };
  settings.widgets.siteToolsPlacement = "bottom-right";
  assert.equal(resolveSiteToolsPlacement(settings), "top-left");
  settings.widgets.siteToolsPlacement = "top-left";
  assert.equal(resolveSiteToolsPlacement(settings), "top-left");
  settings.widgets.spotify.enabled = false;
  settings.widgets.siteToolsPlacement = "bottom-right";
  assert.equal(resolveSiteToolsPlacement(settings), "bottom-right");
});
