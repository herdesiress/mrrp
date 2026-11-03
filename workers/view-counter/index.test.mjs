import assert from "node:assert/strict";
import test from "node:test";
import worker, { ViewCounter } from "./src/index.mjs";

const createEnvironment = (token = "push-secret") => {
  const values = new Map();
  const storage = {
    async get(key) {
      return values.get(key);
    },
    async put(key, value) {
      values.set(key, value);
    },
    async transaction(callback) {
      return callback(this);
    }
  };
  const counter = new ViewCounter({ storage });
  return {
    SPOTIFY_PUSH_TOKEN: token,
    VIEW_COUNTER: {
      idFromName: () => "site",
      get: () => ({ fetch: (request, init) => counter.fetch(new Request(request, init)) })
    }
  };
};

test("increments and returns a persisted numeric count", async () => {
  const env = createEnvironment();
  const request = () => new Request("https://counter.example/", {
    headers: { Origin: "https://herdesiress.github.io" }
  });
  const first = await worker.fetch(request(), env);
  const second = await worker.fetch(request(), env);
  assert.deepEqual(await first.json(), { count: 1 });
  assert.deepEqual(await second.json(), { count: 2 });
  assert.equal(first.headers.get("Access-Control-Allow-Origin"), "https://herdesiress.github.io");
  assert.equal(first.headers.get("Cache-Control"), "no-store");
});

test("allows local editor origins and rejects unrelated origins", async () => {
  const env = createEnvironment();
  const local = await worker.fetch(new Request("https://counter.example/", {
    headers: { Origin: "http://127.0.0.1:4173" }
  }), env);
  const foreign = await worker.fetch(new Request("https://counter.example/", {
    headers: { Origin: "https://unrelated.example" }
  }), env);
  assert.equal(local.headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:4173");
  assert.equal(foreign.status, 403);
});

test("supports preflight and rejects unsupported methods and paths", async () => {
  const env = createEnvironment();
  const options = await worker.fetch(new Request("https://counter.example/", {
    method: "OPTIONS",
    headers: { Origin: "https://herdesiress.github.io" }
  }), env);
  const post = await worker.fetch(new Request("https://counter.example/", { method: "POST" }), env);
  const nested = await worker.fetch(new Request("https://counter.example/other"), env);
  assert.equal(options.status, 204);
  assert.equal(options.headers.get("Access-Control-Allow-Methods"), "GET, OPTIONS");
  assert.equal(post.status, 405);
  assert.equal(nested.status, 404);
});

test("publishes Spotify metadata only with the private relay key", async () => {
  const env = createEnvironment();
  const snapshot = {
    track: {
      title: "Track",
      artist: "Artist",
      album: "Album",
      cover_url: "https://images.example/cover.jpg",
      playing: true,
      track_id: "track-id",
      spotify_url: "https://open.spotify.com/track/track-id",
      duration_s: 180
    },
    position: 42
  };
  const unauthorized = await worker.fetch(new Request("https://counter.example/publish", {
    method: "POST",
    body: JSON.stringify(snapshot)
  }), env);
  const published = await worker.fetch(new Request("https://counter.example/publish", {
    method: "POST",
    headers: { Authorization: "Bearer push-secret", "Content-Type": "application/json" },
    body: JSON.stringify(snapshot)
  }), env);
  const read = await worker.fetch(new Request("https://counter.example/now-playing", {
    headers: { Origin: "https://herdesiress.github.io" }
  }), env);
  assert.equal(unauthorized.status, 401);
  assert.equal(published.status, 200);
  const current = await read.json();
  assert.deepEqual({ track: current.track, position: current.position }, snapshot);
  assert.equal(Number.isFinite(current.updatedAt), true);
});

test("timestamps relay writes before forwarding them to the durable object", async () => {
  let stored;
  const env = {
    SPOTIFY_PUSH_TOKEN: "push-secret",
    VIEW_COUNTER: {
      idFromName: () => "site",
      get: () => ({
        async fetch(input, init) {
          stored = await new Request(input, init).json();
          return Response.json({ status: "published" });
        }
      })
    }
  };
  const response = await worker.fetch(new Request("https://counter.example/publish", {
    method: "POST",
    headers: {
      Authorization: "Bearer push-secret",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ track: null, position: 0 })
  }), env);
  assert.equal(response.status, 200);
  assert.equal(Number.isFinite(stored.updatedAt), true);
});

test("rejects malformed or oversized Spotify status", async () => {
  const env = createEnvironment();
  const response = await worker.fetch(new Request("https://counter.example/publish", {
    method: "POST",
    headers: { Authorization: "Bearer push-secret", "Content-Type": "application/json" },
    body: JSON.stringify({ track: { title: "x".repeat(513) }, position: 0 })
  }), env);
  assert.equal(response.status, 400);
});
