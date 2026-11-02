import { detectCodeLanguage } from "./scripts/code-language.mjs";

const markdown = document.querySelector("#markdown");
const preview = document.querySelector("#preview");
const saveButton = document.querySelector("#save");
const status = document.querySelector("#status");
const overlay = document.querySelector("#drop-overlay");
const filePicker = document.querySelector("#file-picker");
const tableDialog = document.querySelector("#table-dialog");
const tableGrid = document.querySelector("#table-grid");
const codeDialog = document.querySelector("#code-dialog");
const codeSource = document.querySelector("#code-source");
const codeLanguage = document.querySelector("#code-language");
const detectedLanguage = document.querySelector("#detected-language");
const versionsDialog = document.querySelector("#versions-dialog");
const versionList = document.querySelector("#version-list");
let renderTimer;
let renderRequest = 0;
let savedContent = "";
let selection = { start: 0, end: 0 };
const previewsWithDrop = new WeakSet();

const setStatus = (message, isError = false) => {
  status.textContent = message;
  status.classList.toggle("error", isError);
};

const saveSelection = () => {
  selection = { start: markdown.selectionStart, end: markdown.selectionEnd };
};

const render = async () => {
  const requestId = ++renderRequest;
  try {
    const response = await fetch("./render", {
      method: "POST",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: markdown.value
    });
    if (!response.ok) throw new Error(await response.text());
    const html = await response.text();
    if (requestId !== renderRequest) return;
    const updatedPage = new DOMParser().parseFromString(html, "text/html");
    const page = preview.contentDocument;
    document.title = updatedPage.title;
    const updatedContent = updatedPage.querySelector(".page");
    const currentContent = page.querySelector(".page");
    if (!currentContent || !updatedContent) {
      preview.srcdoc = html;
      return;
    }
    page.title = updatedPage.title;
    currentContent.replaceChildren(...[...updatedContent.childNodes].map((node) => page.importNode(node, true)));
    installDrop(page);
  } catch (error) {
    setStatus(error.message || "preview failed", true);
  }
};

const scheduleRender = () => {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 100);
  setStatus(markdown.value === savedContent ? "" : "unsaved");
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

const save = async () => {
  saveButton.disabled = true;
  setStatus("saving…");
  try {
    const result = await readResponse(await fetch("./save", {
      method: "PUT",
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      body: markdown.value
    }));
    savedContent = markdown.value;
    setStatus(result.message || "saved and pushed");
  } catch (error) {
    setStatus(error.message || "could not save", true);
  } finally {
    saveButton.disabled = false;
  }
};

const loadVersions = async () => {
  versionList.replaceChildren();
  const items = await readResponse(await fetch("./versions", { cache: "no-store" }));
  if (!items.length) {
    const empty = document.createElement("li");
    empty.textContent = "No saved versions yet.";
    versionList.append(empty);
    return;
  }
  for (const version of items) {
    const item = document.createElement("li");
    const details = document.createElement("div");
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

const restoreVersion = async (version) => {
  if (!window.confirm(`Restore ${version.sha.slice(0, 7)} (${version.subject}) and push it to the site?`)) return;
  setStatus("restoring version…");
  try {
    const result = await readResponse(await fetch("./restore", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha: version.sha })
    }));
    markdown.value = result.content;
    savedContent = result.content;
    markdown.setSelectionRange(0, 0);
    saveSelection();
    scheduleRender();
    versionsDialog.close();
    setStatus(result.message || "version restored and pushed");
  } catch (error) {
    setStatus(error.message || "could not restore version", true);
  }
};

const insertText = (text, { block = false, range = selection } = {}) => {
  const before = markdown.value.slice(0, range.start);
  const after = markdown.value.slice(range.end);
  const prefix = block && before && !before.endsWith("\n") ? "\n" : "";
  const suffix = block && after && !after.startsWith("\n") ? "\n" : "";
  const inserted = `${prefix}${text}${suffix}`;
  const cursor = range.start + inserted.length;
  markdown.setRangeText(inserted, range.start, range.end, "select");
  markdown.setSelectionRange(cursor, cursor);
  markdown.focus();
  saveSelection();
  scheduleRender();
};

const insertImageMarkdown = (name, selectionRange) => {
  const alt = name.replace(/\.[^.]+$/, "").replace(/[[\]\\]/g, "");
  insertText(`![${alt}](./media/${name})`, { range: selectionRange });
};

const mediaTypes = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["audio/mpeg", "mp3"],
  ["audio/mp4", "m4a"],
  ["audio/aac", "aac"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/ogg", "ogg"],
  ["audio/flac", "flac"],
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["video/ogg", "ogv"],
  ["video/quicktime", "mov"]
]);

const uploadFile = async (file, selectionRange) => {
  const extension = mediaTypes.get(file.type);
  if (!extension) throw new Error("Choose an image, audio, or video file.");
  if (file.size > 50 * 1024 * 1024) throw new Error("Files must be smaller than 50 MB.");
  const name = `${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`./upload/${name}`, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file
  });
  if (!response.ok) throw new Error(await response.text());
  insertImageMarkdown(name, selectionRange);
  setStatus("file added");
};

const addFile = async (file) => {
  const savedRange = { ...selection };
  overlay.classList.add("uploading");
  setStatus("uploading…");
  try {
    await uploadFile(file, savedRange);
  } catch (error) {
    setStatus(error.message || "file upload failed", true);
  } finally {
    overlay.classList.remove("uploading");
  }
};

const installDrop = (page) => {
  if (previewsWithDrop.has(page)) return;
  previewsWithDrop.add(page);
  page.addEventListener("dragenter", (event) => {
    if ([...event.dataTransfer.types].includes("Files")) {
      event.preventDefault();
      overlay.classList.add("visible");
      overlay.textContent = `drop ${event.dataTransfer.items[0]?.type.startsWith("image/") ? "image" : event.dataTransfer.items[0]?.type.startsWith("audio/") ? "audio" : "video"} at the text cursor`;
    }
  });
  page.addEventListener("dragover", (event) => {
    if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
  });
  page.addEventListener("dragleave", (event) => {
    if (!page.documentElement.contains(event.relatedTarget)) overlay.classList.remove("visible");
  });
  page.addEventListener("drop", async (event) => {
    if (![...event.dataTransfer.types].includes("Files")) return;
    event.preventDefault();
    overlay.classList.remove("visible");
    const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/") || item.type.startsWith("audio/") || item.type.startsWith("video/"));
    if (file) await addFile(file);
  });
};

const readTableGrid = () => {
  const cells = [...tableGrid.querySelectorAll("input")].map((cell) => cell.value);
  return Array.from({ length: tableRows }, (_, row) => cells.slice(row * tableColumns, (row + 1) * tableColumns));
};

const renderTableGrid = (rows, columns, values = []) => {
  tableGrid.replaceChildren();
  tableGrid.style.setProperty("--columns", columns);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const cell = document.createElement("input");
      cell.setAttribute("aria-label", `Row ${row + 1}, column ${column + 1}`);
      cell.placeholder = row === 0 ? `Column ${column + 1}` : "";
      cell.value = values[row]?.[column] ?? (row === 0 ? `Column ${column + 1}` : "");
      tableGrid.append(cell);
    }
  }
};

let tableRows = 3;
let tableColumns = 2;
const openTable = () => {
  tableRows = 3;
  tableColumns = 2;
  renderTableGrid(tableRows, tableColumns);
  tableDialog.showModal();
};

document.querySelector("#add-row").addEventListener("click", () => {
  const values = readTableGrid();
  values.push(Array(tableColumns).fill(""));
  tableRows++;
  renderTableGrid(tableRows, tableColumns, values);
});

document.querySelector("#add-column").addEventListener("click", () => {
  const values = readTableGrid();
  values.forEach((row) => row.push(""));
  tableColumns++;
  renderTableGrid(tableRows, tableColumns, values);
});

document.querySelector("#insert-table").addEventListener("click", (event) => {
  event.preventDefault();
  const rows = readTableGrid().map((row) => row.map((cell) => cell.replaceAll("|", "\\|")));
  const lines = [
    `| ${rows[0].join(" | ")} |`,
    `| ${rows[0].map(() => "---").join(" | ")} |`,
    ...rows.slice(1).map((row) => `| ${row.join(" | ")} |`)
  ];
  insertText(lines.join("\n"), { block: true });
  tableDialog.close();
});

const openCode = () => {
  codeSource.value = "";
  codeLanguage.value = "";
  detectedLanguage.textContent = "detected: Text";
  codeDialog.showModal();
  codeSource.focus();
};

codeSource.addEventListener("input", () => {
  detectedLanguage.textContent = `detected: ${detectCodeLanguage(codeSource.value)}`;
});

document.querySelector("#insert-code").addEventListener("click", (event) => {
  event.preventDefault();
  const fenceLanguage = codeLanguage.value || "";
  insertText(`\`\`\`${fenceLanguage}\n${codeSource.value}\n\`\`\``, { block: true });
  codeDialog.close();
});

markdown.addEventListener("input", () => {
  saveSelection();
  scheduleRender();
});
markdown.addEventListener("select", saveSelection);
markdown.addEventListener("keyup", saveSelection);
markdown.addEventListener("click", saveSelection);
markdown.addEventListener("input", saveSelection);
document.querySelectorAll("[data-insert]").forEach((button) => {
  button.addEventListener("click", () => insertText(button.dataset.insert));
});
document.querySelector("#open-table").addEventListener("click", openTable);
document.querySelector("#open-code").addEventListener("click", openCode);
document.querySelector("#syntax-code").addEventListener("click", openCode);
document.querySelector("#syntax-table").addEventListener("click", openTable);
document.querySelector("#add-file").addEventListener("click", () => filePicker.click());
filePicker.addEventListener("change", () => {
  const [file] = filePicker.files;
  if (file) addFile(file);
  filePicker.value = "";
});
saveButton.addEventListener("click", save);
document.querySelector("#open-versions").addEventListener("click", async () => {
  versionsDialog.showModal();
  try {
    await loadVersions();
  } catch (error) {
    setStatus(error.message || "could not load versions", true);
  }
});
document.querySelector("#close-versions").addEventListener("click", () => versionsDialog.close());
window.addEventListener("dragover", (event) => {
  if ([...event.dataTransfer.types].includes("Files")) {
    event.preventDefault();
    overlay.classList.add("visible");
  }
});
window.addEventListener("drop", (event) => {
  if ([...event.dataTransfer.types].includes("Files")) {
    event.preventDefault();
    overlay.classList.remove("visible");
    const file = [...event.dataTransfer.files].find((item) => mediaTypes.has(item.type));
    if (file) addFile(file);
  }
});
window.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    save();
  }
});

const load = async () => {
  const response = await fetch("./content.md", { cache: "no-store" });
  if (!response.ok) throw new Error(await response.text());
  savedContent = await response.text();
  markdown.value = savedContent;
  saveSelection();
  await render();
};

load().catch((error) => setStatus(error.message || "could not load site", true));
