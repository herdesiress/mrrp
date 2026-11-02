import TurndownService from "/node_modules/turndown/lib/turndown.es.js";
import { gfm } from "/node_modules/turndown-plugin-gfm/lib/turndown-plugin-gfm.es.js";

const site = document.querySelector("#site");
const titleInput = document.querySelector("#site-title");
const saveButton = document.querySelector("#save");
const status = document.querySelector("#status");
const versionsDialog = document.querySelector("#versions-dialog");
const versionList = document.querySelector("#version-list");
const turndown = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  headingStyle: "atx"
});
turndown.use(gfm);

let page;
let savedMarkup = "";
const initializedPages = new WeakSet();

const setStatus = (message, isError = false) => {
  status.textContent = message;
  status.classList.toggle("error", isError);
};

const readResponse = async (response) => {
  const body = await response.text();
  let result;
  try {
    result = body ? JSON.parse(body) : {};
  } catch {
    result = { error: body };
  }
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
};

const updateTitle = () => {
  const title = page.querySelector("h1")?.textContent.trim() || "";
  titleInput.value = title;
  site.contentDocument.title = title || "home";
  document.title = title || "home";
};

const updatePageTitle = () => {
  let heading = page.querySelector("h1");
  if (!heading) {
    heading = site.contentDocument.createElement("h1");
    page.prepend(heading);
  }
  heading.textContent = titleInput.value;
  updateTitle();
  setStatus(page.innerHTML === savedMarkup ? "" : "unsaved");
};

const initializeEditor = () => {
  const previewDocument = site.contentDocument;
  page = previewDocument?.querySelector(".page");
  if (!page) return;
  if (initializedPages.has(page)) return;
  initializedPages.add(page);
  page.contentEditable = "true";
  page.spellcheck = true;
  page.setAttribute("aria-label", "Edit your site");
  const editStyle = previewDocument.createElement("style");
  editStyle.textContent = ".page[contenteditable=true]{caret-color:#d5d5d5}.page[contenteditable=true]:focus{outline:none}";
  previewDocument.head.append(editStyle);
  page.addEventListener("input", () => {
    updateTitle();
    setStatus(page.innerHTML === savedMarkup ? "" : "unsaved");
  });
  page.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      save();
    }
  });
  savedMarkup = page.innerHTML;
  updateTitle();
  setStatus("");
  saveButton.disabled = false;
};

const save = async () => {
  if (!page) return;
  saveButton.disabled = true;
  setStatus("saving…");
  try {
    const markdown = turndown.turndown(page.innerHTML);
    const result = await readResponse(await fetch("./save", {
      method: "PUT",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: markdown
    }));
    savedMarkup = page.innerHTML;
    setStatus(result.message || "saved and pushed to main");
  } catch (error) {
    setStatus(error.message || "could not publish", true);
  } finally {
    saveButton.disabled = false;
  }
};

const restoreVersion = async (version) => {
  if (!window.confirm(`Restore ${version.sha.slice(0, 7)} (${version.subject}) and push it to the site?`)) return;
  setStatus("restoring version…");
  try {
    await readResponse(await fetch("./restore", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: version.sha })
    }));
    const loaded = new Promise((resolve) => site.addEventListener("load", resolve, { once: true }));
    site.contentWindow.location.reload();
    await loaded;
    versionsDialog.close();
    setStatus("version restored and pushed to main");
  } catch (error) {
    setStatus(error.message || "could not restore version", true);
  }
};

const loadVersions = async () => {
  versionList.replaceChildren();
  const versions = await readResponse(await fetch("./versions", { cache: "no-store" }));
  if (!versions.length) {
    const empty = document.createElement("li");
    empty.textContent = "No saved versions yet.";
    versionList.append(empty);
    return;
  }
  for (const version of versions) {
    const item = document.createElement("li");
    const details = document.createElement("span");
    details.className = "version-details";
    const subject = document.createElement("span");
    subject.textContent = version.subject;
    const date = document.createElement("small");
    date.textContent = `${version.date} · ${version.sha.slice(0, 7)}`;
    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.textContent = "restore";
    restoreButton.addEventListener("click", () => restoreVersion(version));
    details.append(subject, date);
    item.append(details, restoreButton);
    versionList.append(item);
  }
};

site.addEventListener("load", initializeEditor);
if (site.contentDocument?.readyState === "complete") initializeEditor();
titleInput.addEventListener("input", updatePageTitle);
document.querySelector("#open-versions").addEventListener("click", async () => {
  versionsDialog.showModal();
  try {
    await loadVersions();
  } catch (error) {
    setStatus(error.message || "could not load versions", true);
  }
});
document.querySelector("#close-versions").addEventListener("click", () => versionsDialog.close());
saveButton.addEventListener("click", save);
