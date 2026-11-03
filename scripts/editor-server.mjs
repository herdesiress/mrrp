import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { renderMarkdownPage, titleFromMarkdown } from "./markdown.mjs";
import { getRemovedMediaFiles } from "./media-cleanup.mjs";
import { gitPushEnvironment } from "./git-push-environment.mjs";
import { defaultSiteSettings, normalizeSiteSettings, validSiteSettings } from "./site-settings.mjs";
import { publishedPaths, siteAssetPaths } from "./publish-paths.mjs";
import { pageBodyPath, readPageBody, readPages, renderSiteNavigation, slugifyPage, validPageSlug, writePages } from "./pages.mjs";

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

const readSiteState = async (pageSlug = "home") => {
  const isHome = pageSlug === "home";
  const pages = await readPages(root);
  const page = isHome ? null : pages.find((entry) => entry.slug === pageSlug);
  if (!isHome && !page) throw Object.assign(new Error("Page not found."), { statusCode: 404 });
  const [content, titleText, settings, commitTime] = await Promise.all([
    isHome ? readFile(contentPath, "utf8") : readPageBody(root, pageSlug).then((body) => body ?? `# ${page.title}\n`),
    isHome ? readFile(titlePath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "";
      throw error;
    }) : page.title,
    readSettings(),
    git("log", "-1", "--format=%ct", "--", ...publishedPaths)
  ]);
  const title = isHome ? titleText.trim() || titleFromMarkdown(content) : page.title;
  const normalizedSettings = normalizeSiteSettings(settings);
  const payload = { content, title, settings: normalizedSettings, page: pageSlug };
  const watched = isHome ? [contentPath, titlePath, settingsPath] : [pageBodyPath(root, pageSlug), settingsPath];
  const stats = await Promise.all(watched.map((path) => stat(path).catch((error) => {
    if (error.code === "ENOENT") return { mtimeMs: 0 };
    throw error;
  })));
  const revision = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return {
    ...payload,
    pages,
    revision,
    updatedAt: Math.max(Number(commitTime || 0) * 1000, ...stats.map((entry) => entry.mtimeMs))
  };
};
const readSiteVersion = async () => (await git("rev-parse", "--short=7", "HEAD")).trim();

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

// Media is shared by every page, so cleanup has to look at the whole site or
// saving one page deletes files another page still points at.
const readSiteMarkdown = async () => {
  const pages = await readPages(root);
  const [home, ...bodies] = await Promise.all([
    readFile(contentPath, "utf8").catch(() => ""),
    ...pages.map((entry) => readPageBody(root, entry.slug))
  ]);
  return [home, ...bodies.map((body) => body ?? "")].join("\n");
};

const cleanRemovedMedia = async (previousMarkdown) => {
  const markdown = await readSiteMarkdown();
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
  if (/non-fast-forward|fetch first|\[rejected\]|divergent branches/i.test(details)) {
    return "Saved locally, but main moved on GitHub first. Retry the save so it lands on top of the newer main.";
  }
  return `Saved locally, but Git push failed: ${details}`;
};

const isAncestor = async (ancestor, descendant) =>
  git("merge-base", "--is-ancestor", ancestor, descendant)
    .then(() => true)
    .catch(() => false);

// Git's stderr is mostly advice; keep the one line that names the problem.
const firstLine = (error) => (error.stderr || error.message || "")
  .split(/[\r\n]+/)
  .map((line) => line.trim())
  .find((line) => line && !/^(hint:|Rebasing|Could not apply)/i.test(line)) ?? "git failed";

// Replay this checkout on top of main before pushing. Without this a save made
// from a checkout that is behind turns into a rejected non-fast-forward push.
const alignWithMain = async () => {
  try {
    await git("fetch", "--quiet", "origin", "main");
  } catch {
    return;
  }
  const head = (await git("rev-parse", "HEAD")).trim();
  const remote = (await git("rev-parse", "origin/main")).trim();
  if (remote === head || await isAncestor(remote, head)) return;
  if (await isAncestor(head, remote)) {
    try {
      await git("merge", "--ff-only", "--no-edit", "origin/main");
    } catch (error) {
      throw new Error(`main moved on GitHub and this checkout could not fast-forward (${firstLine(error)}). Commit or stash local edits, run \`git pull\`, then save again.`);
    }
    return;
  }
  const dirty = await git("status", "--porcelain", "--untracked-files=no").catch(() => "");
  if (dirty) {
    throw new Error("main moved on GitHub and this checkout has uncommitted edits. Commit or stash them, run `git pull --rebase`, then save again.");
  }
  try {
    await git("rebase", "origin/main");
  } catch (error) {
    await git("rebase", "--abort").catch(() => {});
    throw new Error(`main moved on GitHub and this version conflicts with it (${firstLine(error)}). Run \`git pull --rebase\` in the repo, resolve the conflict, then save again.`);
  }
};

const versions = async () => {
  const output = await git("log", "-n", "50", "--format=%H%x09%cs%x09%s", "--", ...publishedPaths);
  return output ? output.split("\n").map((line) => {
    const [sha, date, ...subject] = line.split("\t");
    return { sha, date, subject: subject.join("\t") };
  }) : [];
};

const readDeployStatus = async (sha) => {
  try {
    const { stdout } = await execFileAsync("gh", [
      "run", "list", "--commit", sha, "--limit", "1", "--json", "status,conclusion,url"
    ], { cwd: root, timeout: 15_000, maxBuffer: 1_000_000 });
    const [run] = JSON.parse(stdout || "[]");
    return run ? { status: run.status, conclusion: run.conclusion, url: run.url } : { status: "waiting" };
  } catch {
    return { status: "unknown" };
  }
};

let lastPushedHead = null;
const pushMain = async () => {
  await push("-c", "core.compression=0", "-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential", "push", "origin", "HEAD:main");
};

// `git add` fails on a pathspec that does not exist yet (no pages/, no media/),
// so only hand git the paths that are actually on disk.
const existingPublishedPaths = () => publishedPaths.filter((path) => existsSync(resolve(root, path)));

const publishSite = async (subject = "Update personal site") => {
  const paths = existingPublishedPaths();
  await git("add", "--", ...paths);
  const changes = await git("diff", "--cached", "--quiet", "--", ...paths)
    .then(() => false)
    .catch((error) => {
      if (error.code === 1) return true;
      throw error;
    });
  if (changes) await git("commit", "--only", "-m", subject, "--", ...paths);
  const head = await git("rev-parse", "HEAD");
  if (head !== lastPushedHead) {
    const retryable = (error) =>
      /non-fast-forward|fetch first|\[rejected\]|\[remote rejected\]|cannot lock ref|divergent branches/i
        .test(error.stderr ?? error.message ?? "");
    await alignWithMain();
    for (let attempt = 0; ; attempt += 1) {
      try {
        await pushMain();
        break;
      } catch (error) {
        // Someone else pushed at the same moment; re-sync and try again a few
        // times instead of telling the user their save failed.
        if (attempt >= 2 || !retryable(error)) throw error;
        await new Promise((done) => setTimeout(done, 400 * (attempt + 1)));
        await alignWithMain();
      }
    }
    lastPushedHead = await git("rev-parse", "HEAD");
  }
  // Read the version after syncing: a rebase rewrites the commit the save made.
  const output = await git("log", "-1", "--format=%H%x09%cs%x09%s", "--", ...publishedPaths);
  const [sha, date, ...subjectParts] = output.split("\t");
  return sha ? { sha, date, subject: subjectParts.join("\t") } : null;
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
      const version = await readSiteVersion();
      const pages = state.pages;
      const navigation = renderSiteNavigation({ pages, isHome: (draft.page ?? "home") === "home" });
      const html = renderMarkdownPage(draft.content, "/preview/site.css", "/preview/", "/preview/site.js", draft.title, draft.settings, new Date(state.updatedAt).toISOString(), version, navigation);
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
      const requestedPage = new URL(request.url, "http://localhost").searchParams.get("page") ?? "home";
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
        .end(JSON.stringify(await readSiteState(requestedPage)));
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
      const pageSlug = payload.page ?? "home";
      if (pageSlug !== "home" && !validPageSlug.test(pageSlug)) {
        response.writeHead(400).end("Save data must name a valid page.");
        return;
      }
      const isHome = pageSlug === "home";
      const markdown = payload.content.replace(/\n*$/, "");
      const title = payload.title.trim() || (isHome ? "home" : pageSlug);
      const previousMarkdown = await readSiteMarkdown();
      if (isHome) {
        await writeFile(contentPath, `${markdown}\n`);
        await writeFile(titlePath, `${title}\n`);
      } else {
        const pages = await readPages(root);
        const index = pages.findIndex((entry) => entry.slug === pageSlug);
        if (index === -1) {
          response.writeHead(404).end("Page not found.");
          return;
        }
        await mkdir(dirname(pageBodyPath(root, pageSlug)), { recursive: true });
        await writeFile(pageBodyPath(root, pageSlug), `${markdown}\n`);
        pages[index] = { ...pages[index], title };
        await writePages(root, pages);
      }
      await writeFile(settingsPath, `${JSON.stringify(payload.settings, null, 2)}\n`);
      await cleanRemovedMedia(previousMarkdown);
      try {
        const version = await publishSite(payload.versionName?.trim() || "Update personal site");
        const savedPayload = {
          content: `${markdown}\n`,
          title,
          settings: normalizeSiteSettings(payload.settings),
          page: pageSlug
        };
        const revision = createHash("sha256").update(JSON.stringify(savedPayload)).digest("hex");
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
          .end(JSON.stringify({ version, revision, page: pageSlug, message: "saved and pushed to main" }));
      } catch (error) {
        response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" })
          .end(JSON.stringify({ error: pushFailure(error) }));
      }
      return;
    }
    if (request.method === "GET" && pathname === "/deploy") {
      const sha = new URL(request.url, "http://localhost").searchParams.get("sha") ?? "";
      if (!/^[0-9a-f]{7,40}$/.test(sha)) {
        response.writeHead(400).end("Unknown version.");
        return;
      }
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
        .end(JSON.stringify(await readDeployStatus(sha)));
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
        const hasSavedAssets = Boolean(await git("ls-tree", "-r", "--name-only", requestedVersion, "--", ...siteAssetPaths));
        if (hasSavedAssets) {
          await git("restore", `--source=${requestedVersion}`, "--staged", "--worktree", "--", ...siteAssetPaths);
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
    if (request.method === "PUT" && pathname === "/pages/order") {
      let payload;
      try {
        payload = JSON.parse((await readBody(request, 10_000) || Buffer.from("{}")).toString("utf8"));
      } catch {
        response.writeHead(400).end("Page order must be JSON.");
        return;
      }
      const slugs = Array.isArray(payload.slugs) ? payload.slugs.map((slug) => String(slug)) : [];
      const pages = await readPages(root);
      const known = new Set(pages.map((entry) => entry.slug));
      if (slugs.length !== pages.length || new Set(slugs).size !== slugs.length || !slugs.every((slug) => known.has(slug))) {
        response.writeHead(400).end("Invalid page order.");
        return;
      }
      const bySlug = new Map(pages.map((entry) => [entry.slug, entry]));
      await writePages(root, slugs.map((slug) => bySlug.get(slug)));
      const version = await publishSite("Reorder pages").catch((error) => ({ warning: pushFailure(error) }));
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
        .end(JSON.stringify({
          pages: await readPages(root),
          version,
          message: version.warning ? "page order saved, but the push failed" : "page order saved and pushed to main"
        }));
      return;
    }
    if (pathname === "/pages") {
      const cleanText = (value, limit) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
      const reply = async (extra, status = 200) => {
        const pages = await readPages(root);
        response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
          .end(JSON.stringify({ pages, ...extra }));
      };
      if (request.method === "GET") {
        await reply({});
        return;
      }
      if (!["POST", "PUT", "DELETE"].includes(request.method)) {
        response.writeHead(405).end("Unsupported pages request.");
        return;
      }
      let payload;
      try {
        payload = JSON.parse((await readBody(request, 10_000) || Buffer.from("{}")).toString("utf8"));
      } catch {
        response.writeHead(400).end("Pages request must be JSON.");
        return;
      }
      if (request.method === "POST") {
        const title = cleanText(payload.title, 60);
        if (!title) {
          response.writeHead(400).end("A page needs a name.");
          return;
        }
        const pages = await readPages(root);
        // Creating the same page twice is a double submit, not a new page.
        const existing = pages.find((entry) => entry.title.toLowerCase() === title.toLowerCase());
        if (existing) {
          await reply({ slug: existing.slug, message: "that page already exists" });
          return;
        }
        if (pages.length >= 60) {
          response.writeHead(409).end("That is the maximum number of pages.");
          return;
        }
        const base = slugifyPage(title);
        let slug = base;
        for (let suffix = 2; pages.some((entry) => entry.slug === slug); suffix += 1) slug = `${base}-${suffix}`;
        const category = cleanText(payload.category, 40);
        pages.push(category ? { slug, title, category } : { slug, title });
        await writePages(root, pages);
        await mkdir(dirname(pageBodyPath(root, slug)), { recursive: true });
        await writeFile(pageBodyPath(root, slug), `# ${title}\n`);
        const version = await publishSite(`Add page ${title}`).catch((error) => ({ warning: pushFailure(error) }));
        await reply({ slug, version, message: version.warning ? "page created, but the push failed" : "page created and pushed to main" });
        return;
      }
      const slug = String(payload.slug ?? "").trim().toLowerCase();
      if (!validPageSlug.test(slug)) {
        response.writeHead(400).end("Unknown page.");
        return;
      }
      const pages = await readPages(root);
      const index = pages.findIndex((entry) => entry.slug === slug);
      if (index === -1) {
        // Deleting something already gone is a success; the list just refreshes.
        if (request.method === "DELETE") {
          await reply({ message: "page already removed" });
          return;
        }
        response.writeHead(404).end("Page not found.");
        return;
      }
      if (request.method === "PUT") {
        const title = cleanText(payload.title, 60);
        if (!title) {
          response.writeHead(400).end("A page needs a name.");
          return;
        }
        const category = cleanText(payload.category, 40);
        pages[index] = category ? { slug, title, category } : { slug, title };
        await writePages(root, pages);
        const version = await publishSite(`Rename page to ${title}`).catch((error) => ({ warning: pushFailure(error) }));
        await reply({ version, message: version.warning ? "page renamed, but the push failed" : "page renamed and pushed to main" });
        return;
      }
      pages.splice(index, 1);
      await writePages(root, pages);
      await rm(pageBodyPath(root, slug), { force: true });
      const version = await publishSite(`Remove page ${slug}`).catch((error) => ({ warning: pushFailure(error) }));
      await reply({ version, message: version.warning ? "page removed, but the push failed" : "page removed and pushed to main" });
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
      const state = await readSiteState("home");
      const version = await readSiteVersion();
      const navigation = renderSiteNavigation({ pages: state.pages, isHome: true });
      const html = renderMarkdownPage(state.content, "./site.css", "./", "./site.js", state.title, state.settings, new Date(state.updatedAt).toISOString(), version, navigation);
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }).end(html);
      return;
    }
    // Page previews live at /preview/<slug>/ so the same relative links the
    // built site uses (./other-page/, ../ for home) resolve here too.
    const previewPage = pathname.match(/^\/preview\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/)?$/);
    if (previewPage && (request.method === "GET" || request.method === "HEAD")) {
      if (!previewPage[2]) {
        response.writeHead(308, { Location: `${pathname}/` }).end();
        return;
      }
      let state;
      try {
        state = await readSiteState(previewPage[1]);
      } catch (error) {
        if (error.statusCode === 404) {
          response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" })
            .end(`<!doctype html><meta charset="utf-8"><title>page not found</title><p>No page called ${previewPage[1].replace(/[<>&"]/g, "")}.</p><p><a href="../">back home</a></p>`);
          return;
        }
        throw error;
      }
      const version = await readSiteVersion();
      const navigation = renderSiteNavigation({ pages: state.pages, isHome: false });
      const html = renderMarkdownPage(state.content, "site.css", "../", "site.js", state.title, state.settings, new Date(state.updatedAt).toISOString(), version, navigation);
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
