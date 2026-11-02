import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { renderMarkdownPage } from "./markdown.mjs";

const execFileAsync = promisify(execFile);
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const contentPath = resolve(root, "content.md");
const mediaPath = resolve(root, "public/media");
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

const versions = async () => {
  const output = await git("log", "-n", "50", "--format=%H%x09%cs%x09%s", "--", "content.md", "public/media");
  return output ? output.split("\n").map((line) => {
    const [sha, date, ...subject] = line.split("\t");
    return { sha, date, subject: subject.join("\t") };
  }) : [];
};

const publishSite = async (subject = "Update personal site") => {
  await git("add", "--", "content.md", "public/media");
  const changes = await git("diff", "--cached", "--quiet", "--", "content.md", "public/media")
    .then(() => false)
    .catch((error) => {
      if (error.code === 1) return true;
      throw error;
    });
  if (changes) await git("commit", "--only", "-m", subject, "--", "content.md", "public/media");
  await git("-c", "credential.helper=", "-c", "credential.helper=!gh auth git-credential", "push", "origin", "HEAD:main");
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
    if (request.method === "PUT" && pathname === "/save") {
      const body = await readBody(request, 100_000);
      if (!body) {
        response.writeHead(413).end("Markdown is too large.");
        return;
      }
      const markdown = body.toString("utf8").replace(/\n*$/, "");
      await writeFile(contentPath, `${markdown}\n`);
      try {
        const version = await publishSite();
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
          .end(JSON.stringify({ version, message: "saved and pushed to main" }));
      } catch (error) {
        response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" })
          .end(JSON.stringify({ error: `Saved locally, but Git push failed: ${error.stderr?.trim() || error.message}` }));
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
        const version = await publishSite("Restore personal site version");
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
          .end(JSON.stringify({
            content: await readFile(contentPath, "utf8"),
            version,
            message: "version restored and pushed to main"
          }));
      } catch (error) {
        response.writeHead(502, { "Content-Type": "application/json; charset=utf-8" })
          .end(JSON.stringify({ error: `Could not publish the restored version: ${error.stderr?.trim() || error.message}` }));
      }
      return;
    }
    if (request.method !== "GET") {
      response.writeHead(405).end("Method not allowed.");
      return;
    }

    if (pathname === "/preview/" || pathname === "/preview/index.html") {
      const markdown = await readFile(contentPath, "utf8");
      const html = renderMarkdownPage(markdown, "/preview/site.css", "/preview/", "/preview/site.js");
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
