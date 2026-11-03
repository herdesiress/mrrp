import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { renderMarkdownPage, titleFromMarkdown } from "./markdown.mjs";
import { getRemovedMediaFiles } from "./media-cleanup.mjs";
import { gitPushEnvironment } from "./git-push-environment.mjs";
import { defaultSiteSettings, normalizeSiteSettings, validSiteSettings } from "./site-settings.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contentPath = resolve(root, "content.md");
const titlePath = resolve(root, "site-title.txt");
const settingsPath = resolve(root, "site-settings.json");
const mediaPath = resolve(root, "public/media");
const uploadsManifestPath = resolve(root, ".editor-uploads.json");
const renderedDrafts = new Map();
const port = Number(process.env.PORT ?? 4173);
const expectedOrigin = `http://127.0.0.1:${port}`;
const editorFiles = new Map([
  ["/", "editor.html"],
  ["/editor.css", "editor.css"],
  ["/editor.js", "editor.js"],
  ["/node_modules/turndown/lib/turndown.es.js", "node_modules/turndown/lib/turndown.es.js"],
  ["/node_modules/turndown-plugin-gfm/lib/turndown-plugin-gfm.es.js", "node_modules/turndown-plugin-gfm/lib/turndown-plugin-gfm.es.js"]
]);
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogv": "video/ogg",
  ".mov": "video/quicktime"
};
const mediaTypes = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".mp3", "audio/mpeg"],
  [".m4a", "audio/mp4"],
  [".aac", "audio/aac"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"],
  [".flac", "audio/flac"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".ogv", "video/ogg"],
  [".mov", "video/quicktime"]
]);
const defaultSettings = defaultSiteSettings;
const readSettings = async () => {
  try {
    return normalizeSiteSettings(JSON.parse(await readFile(settingsPath, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return defaultSettings();
    throw error;
  }
};

const readSiteState = async () => {
  const [content, titleText, settings, commitTime] = await Promise.all([
    readFile(contentPath, "utf8"),
    readFile(titlePath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    }),
    readSettings(),
    git("log", "-1", "--format=%ct", "--", "content.md", "site-title.txt", "site-settings.json", "public/media")
  ]);
  const title = titleText.trim() || titleFromMarkdown(content);
  const normalizedSettings = normalizeSiteSettings(settings);
  const payload = { content, title, settings: normalizedSettings };
  const [contentStat, titleStat, settingsStat] = await Promise.all(
    [contentPath, titlePath, settingsPath].map((path) => stat(path).catch((error) => {
      if (error.code === "ENOENT") return { mtimeMs: 0 };
      throw error;
    }))
  );
  const revision = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return {
    ...payload,
    revision,
    updatedAt: Math.max(Number(commitTime || 0) * 1000, contentStat.mtimeMs, titleStat.mtimeMs, settingsStat.mtimeMs)
  };
};

const mediaFilePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpe?g|gif|webp|mp3|m4a|aac|wav|ogg|flac|mp4|webm|ogv|mov)$/i;
const readUploadedMedia = async () => {
  try {
    const saved = JSON.parse(await readFile(uploadsManifestPath, "utf8"));
    if (!Array.isArray(saved)) throw new Error("Editor upload manifest must contain a list.");
    return new Set(saved.filter((name) => typeof name === "string" && mediaFilePattern.test(name)));
  } catch (error) {
    if (error.code === "ENOENT") return new Set();
    throw error;
  }
};
const uploadedMedia = await readUploadedMedia();

const saveUploadManifest = async () => {
  await writeFile(uploadsManifestPath, `${JSON.stringify([...uploadedMedia].sort(), null, 2)}\n`);
};

const cleanRemovedMedia = async (previousMarkdown, markdown) => {
  for (const filename of getRemovedMediaFiles(previousMarkdown, markdown, uploadedMedia)) {
    await rm(resolve(mediaPath, filename), { force: true });
    uploadedMedia.delete(filename);
  }
  await saveUploadManifest();
};

const readBody = async (request, limit) => {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > limit) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const git = async (...args) => {
  const { stdout } = await execFileAsync("git", args, {
    cwd: root,
    maxBuffer: 1_000_000,
    timeout: 60_000
  });
  return stdout.trim();
};
const push = async (...args) => {
  const { stdout } = await execFileAsync("git", args, {
    cwd: root,
    env: gitPushEnvironment(process.env),
    maxBuffer: 1_000_000,
    timeout: 60_000
  });
  return stdout.trim();
};
const pushFailure = (error) => {
  const details = error.stderr?.trim() || error.message;
  if (/invalid username or token|authentication failed|permission to .+ denied|http 403/i.test(details)) {
    return "Saved locally, but GitHub rejected the active account. Sign in with an account that can push to this repository using `gh auth login --web`, then retry.";
  }
  return `Saved locally, but Git push failed: ${details}`;
};

const versions = async () => {
  const output = await git("log", "-n", "50", "--format=%H%x09%cs%x09%s", "--", "content.md", "site-title.txt", "site-settings.json", "public/media");
  return output ? output.split("\n").map((line) => {
    const [sha, date, ...subject] = line.split("\t");
    return { sha, date, subject: subject.join("\t") };
  }) : [];
};

const publishSite = async (subject = "Update personal site") => {
  await git("add", "--", "content.md", "site-title.txt", "site-settings.json", "public/media");
  const changes = await git("diff", "--cached", "--quiet", "--", "content.md", "site-title.txt", "site-settings.json", "public/media")
    .then(() => false)
    .catch((error) => {
      if (error.code === 1) return true;
      throw error;
    });
  if (changes) await git("commit", "--only", "-m", subject, "--", "content.md", "site-title.txt", "site-settings.json", "public/media");
  await push("-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential", "push", "origin", "HEAD:main");
  return (await versions())[0] ?? null;
};

const sendFile = async (response, path) => {
  try {
    const file = await readFile(path);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-store"
    }).end(file);
  } catch (error) {
    if (error.code === "ENOENT") {
      response.writeHead(404).end("Not found.");
      return;
    }
    throw error;
  }
};

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  try {
    if (["PUT", "POST", "DELETE"].includes(request.method) &&
      (request.headers.host !== `${new URL(expectedOrigin).host}` ||
        (request.headers.origin && request.headers.origin !== expectedOrigin))) {
      response.writeHead(403).end("Requests must come from the local editor.");
      return;
    }
    if (request.method === "POST" && pathname === "/render") {
      const body = await readBody(request, 100_000);
      if (!body) {
        response.writeHead(413).end("Draft is too large.");
        return;
      }
      const draft = JSON.parse(body.toString("utf8"));
      if (typeof draft.content !== "string" || typeof draft.title !== "string" || !validSiteSettings(draft.settings)) {
        response.writeHead(400).end("Draft must include content, title, and site settings.");
        return;
      }
      const state = await readSiteState();
      const html = renderMarkdownPage(draft.content, "/preview/site.css", "/preview/", "/preview/site.js", draft.title, draft.settings, new Date(state.updatedAt).toISOString());
      const id = randomUUID();
      renderedDrafts.set(id, html);
      if (renderedDrafts.size > 8) renderedDrafts.delete(renderedDrafts.keys().next().value);
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }).end(JSON.stringify({ url: `/draft-preview/${id}` }));
      return;
    }
    if (request.method === "GET" && pathname === "/state") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
        .end(JSON.stringify(await readSiteState()));
      return;
    }
    if (request.method === "PUT" && pathname === "/save") {
      const body = await readBody(request, 100_000);
      if (!body) {
        response.writeHead(413).end("Markdown is too large.");
        return;
      }
      let payload;
      try {
        payload = JSON.parse(body.toString("utf8"));
      } catch {
        response.writeHead(400).end("Save data must include page content and title.");
        return;
      }
      if (typeof payload.content !== "string" || typeof payload.title !== "string" || payload.title.length > 120 ||
        !validSiteSettings(payload.settings) ||
        payload.versionName !== undefined && (typeof payload.versionName !== "string" ||
          payload.versionName.length > 72 || /[\r\n]/.test(payload.versionName))) {
        response.writeHead(400).end("Save data must include valid content, a title, settings, and a single-line version name under 72 characters.");
        return;
      }
      const markdown = payload.content.replace(/\n*$/, "");
      const title = payload.title.trim() || "home";
      const previousMarkdown = await readFile(contentPath, "utf8");
      await writeFile(contentPath, `${markdown}\n`);
      await writeFile(titlePath, `${title}\n`);
      await writeFile(settingsPath, `${JSON.stringify(payload.settings, null, 2)}\n`);
      await cleanRemovedMedia(previousMarkdown, markdown);
      try {
        const version = await publishSite(payload.versionName?.trim() || "Update personal site");
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
          .end(JSON.stringify({ version, message: "saved and pushed to main" }));
      } catch (error) {
        response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" })
          .end(JSON.stringify({ error: pushFailure(error) }));
      }
      return;
    }
    if (request.method === "GET" && pathname === "/versions") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
        .end(JSON.stringify(await versions()));
      return;
    }
    if (request.method === "PUT" && pathname === "/restore") {
      const body = await readBody(request, 1_000);
      if (!body) {
        response.writeHead(413).end("Invalid version request.");
        return;
      }
      let requestedVersion;
      try {
        requestedVersion = JSON.parse(body.toString("utf8")).sha;
      } catch {
        response.writeHead(400).end("Invalid version request.");
        return;
      }
      if (typeof requestedVersion !== "string" || !/^[0-9a-f]{40}$/.test(requestedVersion) ||
        !(await versions()).some((version) => version.sha === requestedVersion)) {
        response.writeHead(404).end("Version not found.");
        return;
      }
      try {
        await git("restore", `--source=${requestedVersion}`, "--staged", "--worktree", "--", "content.md", "public/media");
        const hasSavedTitle = Boolean(await git("ls-tree", "-r", "--name-only", requestedVersion, "--", "site-title.txt"));
        if (hasSavedTitle) {
          await git("restore", `--source=${requestedVersion}`, "--staged", "--worktree", "--", "site-title.txt");
        } else {
          const legacyTitle = titleFromMarkdown(await readFile(contentPath, "utf8"));
          await writeFile(titlePath, `${legacyTitle}\n`);
        }
        const hasSavedSettings = Boolean(await git("ls-tree", "-r", "--name-only", requestedVersion, "--", "site-settings.json"));
        if (hasSavedSettings) {
          await git("restore", `--source=${requestedVersion}`, "--staged", "--worktree", "--", "site-settings.json");
        } else {
          await writeFile(settingsPath, `${JSON.stringify({ motif: { enabled: false, symbol: "" } }, null, 2)}\n`);
        }
        const version = await publishSite("Restore personal site version");
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
          .end(JSON.stringify({
            content: await readFile(contentPath, "utf8"),
            title: (await readFile(titlePath, "utf8")).trim() || "home",
            settings: JSON.parse(await readFile(settingsPath, "utf8")),
            version,
            message: "version restored and pushed to main"
          }));
      } catch (error) {
        response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" })
          .end(JSON.stringify({ error: pushFailure(error).replace("Saved locally, but ", "") }));
      }
      return;
    }
    if (request.method === "PUT" && pathname === "/settings") {
      const body = await readBody(request, 10_000);
      if (!body) {
        response.writeHead(413).end("Settings are too large.");
        return;
      }
      let payload;
      try {
        payload = JSON.parse(body.toString("utf8"));
      } catch {
        response.writeHead(400).end("Settings must include the floating text.");
        return;
      }
      if (typeof payload.symbol !== "string" || typeof payload.enabled !== "boolean" || payload.symbol.length > 32) {
        response.writeHead(400).end("Floating text must be a string under 32 characters.");
        return;
      }
      const settings = await readSettings();
      settings.motif = { enabled: payload.enabled, symbol: payload.symbol, count: settings.motif?.count ?? 3 };
      await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
        .end(JSON.stringify({ settings }));
      return;
    }
    const upload = pathname.match(/^\/upload\/([0-9a-f-]{36}\.(?:png|jpe?g|gif|webp|mp3|m4a|aac|wav|ogg|flac|mp4|webm|ogv|mov))$/i);
    if (request.method === "PUT" && upload) {
      const filename = upload[1].toLowerCase();
      const contentType = mediaTypes.get(extname(filename));
      if (request.headers["content-type"] !== contentType) {
        response.writeHead(415).end("Media type does not match the file extension.");
        return;
      }
      const body = await readBody(request, 50 * 1024 * 1024);
      if (!body) {
        response.writeHead(413).end("Media files must be smaller than 50 MB.");
        return;
      }
      await writeFile(resolve(mediaPath, filename), body, { flag: "wx" });
      uploadedMedia.add(filename);
      await saveUploadManifest();
      response.writeHead(201).end();
      return;
    }
    if (request.method !== "GET") {
      response.writeHead(405).end("Method not allowed.");
      return;
    }

    if (pathname === "/preview/" || pathname === "/preview/index.html") {
      const markdown = await readFile(contentPath, "utf8");
      const title = (await readFile(titlePath, "utf8")).trim() || "home";
      const settings = await readSettings();
      const state = await readSiteState();
      const html = renderMarkdownPage(markdown, "/preview/site.css", "/preview/", "/preview/site.js", title, settings, new Date(state.updatedAt).toISOString());
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }).end(html);
      return;
    }
    const draftPreview = pathname.match(/^\/draft-preview\/([0-9a-f-]{36})$/i);
    if (draftPreview) {
      const html = renderedDrafts.get(draftPreview[1]);
      if (!html) {
        response.writeHead(404).end("Draft preview expired.");
        return;
      }
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }).end(html);
      return;
    }
    if (pathname === "/preview/site.css") {
      await sendFile(response, resolve(root, "public/site.css"));
      return;
    }
    if (pathname === "/preview/site.js") {
      await sendFile(response, resolve(root, "public/site.js"));
      return;
    }
    const previewImage = pathname.match(/^\/preview\/media\/([0-9a-f-]{36}\.(?:png|jpe?g|gif|webp|mp3|m4a|aac|wav|ogg|flac|mp4|webm|ogv|mov))$/i);
    if (previewImage) {
      await sendFile(response, resolve(mediaPath, previewImage[1].toLowerCase()));
      return;
    }
    if (pathname === "/settings") {
      await sendFile(response, settingsPath);
      return;
    }
    const editorFile = editorFiles.get(pathname);
    if (editorFile) {
      await sendFile(response, resolve(root, editorFile));
      return;
    }
    response.writeHead(404).end("Not found.");
  } catch (error) {
    console.error(error);
    if (!response.headersSent) response.writeHead(500).end("Could not complete the request.");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Site editor: http://127.0.0.1:${port}`);
});
