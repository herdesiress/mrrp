const siteOrigin = "https://herdesiress.github.io";

const isAllowedOrigin = (origin) =>
  origin === siteOrigin || /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin);

const jsonResponse = (body, status, origin) => {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin"
  });
  if (origin && isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
};

const validSpotifySnapshot = (snapshot) => {
  const track = snapshot?.track;
  return snapshot && typeof snapshot === "object" &&
    (track === null || track && typeof track === "object" &&
      ["title", "artist", "album", "cover_url", "track_id", "spotify_url"].every((key) =>
        typeof track[key] === "string" && track[key].length <= 2048) &&
      typeof track.playing === "boolean" &&
      Number.isFinite(track.duration_s) && track.duration_s >= 0) &&
    Number.isFinite(snapshot.position) && snapshot.position >= 0;
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    if (origin && !isAllowedOrigin(origin)) {
      return jsonResponse({ error: "Origin not allowed" }, 403, "");
    }
    if (request.method === "OPTIONS") {
      const response = jsonResponse({}, 204, origin);
      response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      response.headers.set("Access-Control-Max-Age", "86400");
      return response;
    }
    if (request.method !== "GET") {
      if (request.method === "POST" && new URL(request.url).pathname === "/publish") {
        const configuredToken = env.SPOTIFY_PUSH_TOKEN;
        if (!configuredToken || request.headers.get("Authorization") !== `Bearer ${configuredToken}`) {
          return jsonResponse({ error: "Unauthorized" }, 401, origin);
        }
        let snapshot;
        try {
          snapshot = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON" }, 400, origin);
        }
        if (!validSpotifySnapshot(snapshot)) {
          return jsonResponse({ error: "Invalid Spotify status" }, 400, origin);
        }
        const id = env.VIEW_COUNTER.idFromName("site");
        const counter = env.VIEW_COUNTER.get(id);
        const result = await counter.fetch("https://counter/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(snapshot)
        });
        return jsonResponse({ status: "published" }, result.status, origin);
      }
      return jsonResponse({ error: "Method not allowed" }, 405, origin);
    }
    const pathname = new URL(request.url).pathname;
    if (pathname === "/now-playing") {
      const id = env.VIEW_COUNTER.idFromName("site");
      const counter = env.VIEW_COUNTER.get(id);
      const result = await counter.fetch("https://counter/now-playing");
      return jsonResponse(await result.json(), result.status, origin);
    }
    if (pathname !== "/") {
      return jsonResponse({ error: "Not found" }, 404, origin);
    }

    try {
      const id = env.VIEW_COUNTER.idFromName("site");
      const counter = env.VIEW_COUNTER.get(id);
      const result = await counter.fetch("https://counter/increment");
      return jsonResponse(await result.json(), result.status, origin);
    } catch {
      return jsonResponse({ error: "Counter unavailable" }, 500, origin);
    }
  }
};

export class ViewCounter {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    if (new URL(request.url).pathname === "/publish" && request.method === "POST") {
      const snapshot = await request.json();
      await this.ctx.storage.put("nowPlaying", { ...snapshot, updatedAt: Date.now() });
      return Response.json({ status: "published" });
    }
    if (new URL(request.url).pathname === "/now-playing") {
      return Response.json(await this.ctx.storage.get("nowPlaying") ?? { track: null, position: 0 });
    }
    const count = await this.ctx.storage.transaction(async (transaction) => {
      const current = await transaction.get("count") ?? 0;
      const next = current + 1;
      await transaction.put("count", next);
      return next;
    });
    return Response.json({ count });
  }
}
