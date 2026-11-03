import TurndownService from "/node_modules/turndown/lib/turndown.es.js";
import { gfm } from "/node_modules/turndown-plugin-gfm/lib/turndown-plugin-gfm.es.js";

const site = document.querySelector("#site");
const titleInput = document.querySelector("#site-title");
const saveButton = document.querySelector("#save");
const status = document.querySelector("#status");
const recoverButton = document.querySelector("#recover-draft");
const pushHelpDialog = document.querySelector("#push-help-dialog");
const pushHelpTitle = document.querySelector("#push-help-title");
const pushHelpMessage = document.querySelector("#push-help-message");
const pushHelpCommand = document.querySelector("#push-help-command");
const versionsDialog = document.querySelector("#versions-dialog");
const versionList = document.querySelector("#version-list");
const versionNameToggle = document.querySelector("#toggle-version-name");
const versionNameInput = document.querySelector("#version-name");
const textColorToggle = document.querySelector("#toggle-text-colors");
const textColorPanel = document.querySelector("#text-color-panel");
const textColorWheel = document.querySelector("#text-color-wheel");
const settingsDialog = document.querySelector("#settings-dialog");
const sourceDialog = document.querySelector("#source-dialog");
const sourceInput = document.querySelector("#markdown-source");
const motifCountInput = document.querySelector("#motif-count");
const motifCountValue = document.querySelector("#motif-count-value");
const dropOverlay = document.querySelector("#drop-overlay");
const markdownReference = document.querySelector("#markdown-reference");
const regionButton = document.querySelector("#toggle-region");
const regionDialog = document.querySelector("#region-dialog");
const regionImage = document.querySelector("#region-image");
const regionVideo = document.querySelector("#region-video");
const regionAscii = document.querySelector("#region-ascii");
const regionFile = document.querySelector("#region-file");
const regionAsciiInput = document.querySelector("#region-ascii-input");
const regionPlace = document.querySelector("#region-place");
const regionCancel = document.querySelector("#region-cancel");
const draftKey = "mrrp-site-editor-draft";
const recoveryKey = "mrrp-site-editor-recovery";
const mediaExtensions = new Map([
  ["image/png", "png"], ["image/jpeg", "jpg"], ["image/gif", "gif"], ["image/webp", "webp"],
  ["audio/mpeg", "mp3"], ["audio/mp4", "m4a"], ["audio/aac", "aac"], ["audio/wav", "wav"],
  ["audio/x-wav", "wav"], ["audio/ogg", "ogg"], ["audio/flac", "flac"],
  ["video/mp4", "mp4"], ["video/webm", "webm"], ["video/ogg", "ogv"], ["video/quicktime", "mov"]
]);
const mediaMimeTypes = new Map([...mediaExtensions]
  .filter(([type]) => type !== "audio/x-wav")
  .map(([type, extension]) => [extension, type]));
const turndown = new TurndownService({
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  headingStyle: "atx"
});
turndown.addRule("discordUnderline", {
  filter: ["u"],
  replacement(content) {
    return `__${content}__`;
  }
});
turndown.addRule("discordSpoiler", {
  filter(node) {
    return node.nodeName === "SPAN" && node.classList.contains("spoiler");
  },
  replacement(content) {
    return `||${content}||`;
  }
});
turndown.addRule("textColor", {
  filter(node) {
    return node.nodeName === "SPAN" && /^#[\da-f]{6}$/i.test(node.getAttribute("data-text-color") || "");
  },
  replacement(content, node) {
    return `{{color:${node.getAttribute("data-text-color").toLowerCase()};${content}}}`;
  }
});
turndown.addRule("renderedCodeBlock", {
  filter(node) {
    return node.nodeName === "DIV" && node.classList.contains("code-block") ||
      node.nodeName === "PRE" && node.classList.contains("ascii-art");
  },
  replacement(content, node) {
    const code = node.nodeName === "PRE" ? node.querySelector("code") : node.querySelector("pre code");
    const language = node.nodeName === "PRE"
      ? [...node.classList].find((name) => name.startsWith("language-ascii-fit-"))?.replace("language-", "")
      : node.querySelector(".code-language")?.textContent?.trim().toLowerCase();
    const text = (code?.textContent ?? node.textContent).replace(/\n+$/, "");
    return `\n\n\`\`\`${language || ""}\n${text}\n\`\`\`\n\n`;
  }
});
turndown.addRule("inlineDataMedia", {
  filter(node) {
    return ["IMG", "AUDIO", "VIDEO"].includes(node.nodeName) &&
      (node.getAttribute("src")?.startsWith("data:") ||
        node.querySelector("source[src^='data:']"));
  },
  replacement() {
    return "[media upload pending]";
  }
});
turndown.addRule("localMedia", {
  filter(node) {
    if (node.nodeName === "IMG") return /(?:^|\/)(?:preview\/)?media\/[0-9a-f-]{36}\.[a-z0-9]+$/i.test(node.getAttribute("src") || "");
    return node.nodeName === "FIGURE" && node.matches(".audio-embed, .video-embed");
  },
  replacement(content, node) {
    const source = node.nodeName === "IMG" ? node.getAttribute("src") : node.querySelector("audio source, video source")?.getAttribute("src");
    const match = source?.match(/(?:^|\/)(?:preview\/)?media\/([0-9a-f-]{36}\.[a-z0-9]+)$/i);
    if (!match) return content;
    const alt = node.nodeName === "IMG"
      ? node.getAttribute("alt")
      : node.querySelector("figcaption")?.textContent;
    const fitWidth = node.getAttribute("data-fit-w");
    const fitHeight = node.getAttribute("data-fit-h");
    const size = fitWidth && fitHeight ? ` "fit=${fitWidth}x${fitHeight}"` : "";
    return `![${(alt || match[1]).replace(/[[\]\\]/g, "")}](./media/${match[1]}${size})`;
  }
});
turndown.use(gfm);

let page;
let lastPushed;
let baseRevision = null;
let recoveryDraft = null;
const defaultWidgets = {
  viewCount: true,
  viewCounterEndpoint: "",
  lastUpdated: true,
  clocks: true,
  themeToggle: true,
  backToTop: true,
  spotify: { enabled: false, endpoint: "", placement: "fixed-bottom-right" }
};
let siteSettings = {
  motif: { enabled: false, symbol: "", count: 3 },
  widgets: { ...defaultWidgets, spotify: { ...defaultWidgets.spotify } },
  ui: { outlines: false, markdown: false }
};
const initializedPages = new WeakSet();
let draftRestorationStarted = false;
let draftRestorationRunning = false;
let regionMode = false;
let regionBox = null;
let regionOverlay = null;
let regionSelection = null;
let savedTextRange = null;

const setStatus = (message, isError = false) => {
  status.textContent = message;
  status.classList.toggle("error", isError);
};

const showPushHelp = (error) => {
  const message = error.message || "";
  const lowerMessage = message.toLowerCase();
  const authFailure = /authentication failed|invalid username or token|permission to .+ denied|http 403|active account/.test(lowerMessage);
  const remoteAhead = /fetch first|non-fast-forward|remote contains work|failed to push some refs/.test(lowerMessage);
  if (!authFailure && !remoteAhead) return false;
  pushHelpTitle.textContent = authFailure ? "Sign in with the site account" : "Main has newer changes";
  pushHelpMessage.textContent = authFailure
    ? "Your changes are saved locally. In a terminal, run this command and sign in as herdesiress. No password or token is entered here. Then return and retry."
    : "Your changes are saved locally, but main has newer commits. Fetch and merge them in this repository, resolve any conflicts without discarding either side, then return and retry.";
  pushHelpCommand.textContent = authFailure
    ? "gh auth login --web"
    : "git fetch origin main && git merge origin/main";
  pushHelpDialog.showModal();
  return true;
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

const now = () => Date.now();

const readRecord = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeRecord = (key, payload) => {
  try {
    localStorage.setItem(key, JSON.stringify({ ...payload, updatedAt: now() }));
    return true;
  } catch (error) {
    setStatus(`could not store in this browser: ${error.message}`, true);
    return false;
  }
};

const pagePayload = (payload) => ({
  content: payload.content?.replace(/\n(?:[ \t]*\n)+/g, "\n\n").replace(/[ \t]+\n$/, "").replace(/\n+$/, "") ?? "",
  title: payload.title,
  settings: {
    motif: {
      enabled: Boolean(payload.settings?.motif?.enabled),
      symbol: payload.settings?.motif?.symbol ?? "",
      count: payload.settings?.motif?.count ?? 3
    },
    widgets: {
      ...defaultWidgets,
      ...payload.settings?.widgets,
      spotify: { ...defaultWidgets.spotify, ...payload.settings?.widgets?.spotify }
    }
  }
});

const samePage = (left, right) => JSON.stringify(pagePayload(left)) === JSON.stringify(pagePayload(right));

const isValidDraft = (draft) => draft && typeof draft.content === "string" && typeof draft.title === "string" &&
  typeof draft.settings?.motif?.symbol === "string" && typeof draft.settings?.motif?.enabled === "boolean" &&
  (draft.settings.motif.count === undefined ||
    (Number.isInteger(draft.settings.motif.count) && draft.settings.motif.count >= 1 && draft.settings.motif.count <= 20)) &&
  (!draft.settings.widgets || ["viewCount", "lastUpdated", "clocks", "themeToggle", "backToTop"].every((key) => typeof draft.settings.widgets[key] === "boolean")) &&
  (draft.versionNameEnabled === undefined || typeof draft.versionNameEnabled === "boolean") &&
  (draft.versionName === undefined || typeof draft.versionName === "string" && draft.versionName.length <= 72);

const rememberTextSelection = () => {
  const selection = site.contentWindow?.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  const elementFor = (node) => node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const start = elementFor(range.startContainer)?.closest("p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th") ?? page;
  const end = elementFor(range.endContainer)?.closest("p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th") ?? page;
  if (start !== end || !page.contains(range.commonAncestorContainer)) return;
  savedTextRange = range.cloneRange();
};

const applyTextColor = (color) => {
  if (!/^#[\da-f]{6}$/i.test(color)) return;
  const doc = site.contentDocument;
  if (!doc || !savedTextRange || !page.contains(savedTextRange.commonAncestorContainer)) {
    setStatus("select text in the page first", true);
    return;
  }
  const fragment = savedTextRange.cloneContents();
  if (fragment.querySelector("p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th")) {
    setStatus("select text within one line or paragraph", true);
    return;
  }
  const selection = site.contentWindow.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedTextRange);
  const range = selection.getRangeAt(0);
  const span = doc.createElement("span");
  span.dataset.textColor = color.toLowerCase();
  span.style.color = color;
  span.append(range.extractContents());
  range.insertNode(span);
  range.selectNodeContents(span);
  selection.removeAllRanges();
  selection.addRange(range);
  savedTextRange = range.cloneRange();
  page.focus();
  updateStatus();
};

const siteWidgetsFromForm = () => ({
  viewCount: document.querySelector("#feature-view-count").checked,
  viewCounterEndpoint: document.querySelector("#view-counter-endpoint").value.trim(),
  lastUpdated: document.querySelector("#feature-updated").checked,
  clocks: document.querySelector("#feature-clocks").checked,
  themeToggle: document.querySelector("#feature-theme").checked,
  backToTop: document.querySelector("#feature-back-top").checked,
  spotify: {
    enabled: document.querySelector("#feature-spotify").checked,
    endpoint: document.querySelector("#spotify-endpoint").value.trim(),
    placement: document.querySelector("#spotify-placement").value
  }
});

const syncSettingsForm = () => {
  document.querySelector("#setting-outlines").checked = Boolean(siteSettings.ui?.outlines);
  document.querySelector("#setting-markdown").checked = Boolean(siteSettings.ui?.markdown);
  document.querySelector("#motif-symbol").value = siteSettings.motif.symbol;
  document.querySelector("#motif-enabled").checked = siteSettings.motif.enabled;
  motifCountInput.value = String(siteSettings.motif.count ?? 3);
  motifCountValue.value = motifCountInput.value;
  motifCountValue.textContent = motifCountInput.value;
  for (const [key, id] of Object.entries({
    viewCount: "#feature-view-count",
    lastUpdated: "#feature-updated",
    clocks: "#feature-clocks",
    themeToggle: "#feature-theme",
    backToTop: "#feature-back-top"
  })) document.querySelector(id).checked = Boolean(siteSettings.widgets[key]);
  document.querySelector("#view-counter-endpoint").value = siteSettings.widgets.viewCounterEndpoint;
  document.querySelector("#feature-spotify").checked = Boolean(siteSettings.widgets.spotify.enabled);
  document.querySelector("#spotify-endpoint").value = siteSettings.widgets.spotify.endpoint;
  document.querySelector("#spotify-placement").value = siteSettings.widgets.spotify.placement;
};

const applySettings = async () => {
  siteSettings.ui = {
    outlines: document.querySelector("#setting-outlines").checked,
    markdown: document.querySelector("#setting-markdown").checked
  };
  siteSettings.motif = {
    enabled: document.querySelector("#motif-enabled").checked,
    symbol: document.querySelector("#motif-symbol").value,
    count: Number(motifCountInput.value)
  };
  siteSettings.widgets = siteWidgetsFromForm();
  page.classList.toggle("editable-outlines", siteSettings.ui.outlines);
  document.querySelector("#toggle-outlines").setAttribute("aria-pressed", String(siteSettings.ui.outlines));
  markdownReference.hidden = !siteSettings.ui.markdown;
  document.querySelector("#toggle-markdown").setAttribute("aria-expanded", String(siteSettings.ui.markdown));
  updateStatus();
  persistDraft();
  const draft = draftPayload();
  try {
    await renderDraft(draft);
    settingsDialog.close();
  } catch (error) {
    setStatus(error.message || "could not apply settings", true);
  }
};

const updateStatus = () => {
  const dirty = !lastPushed || !samePage(publishedPayload(), lastPushed);
  setStatus(dirty ? "unsaved" : "");
  if (dirty) scheduleDraftSave();
  else persistDraft();
};

const publishedPayload = () => ({
  content: turndown.turndown(page.innerHTML),
  title: titleInput.value.trim() || "home",
  settings: { motif: siteSettings.motif, widgets: siteSettings.widgets }
});

const draftPayload = () => ({
  ...publishedPayload(),
  ui: siteSettings.ui,
  versionNameEnabled: versionNameToggle.getAttribute("aria-pressed") === "true",
  versionName: versionNameInput.value.trim(),
  baseRevision
});

const persistDraft = () => {
  if (!page) return;
  if ([...page.querySelectorAll("img, audio, video")].some((node) => inlineDataUrl(node))) return;
  const draft = draftPayload();
  if (lastPushed && samePage(draft, lastPushed) && !(draft.versionNameEnabled && draft.versionName)) {
    localStorage.removeItem(draftKey);
    return;
  }
  writeRecord(draftKey, draft);
};

const scheduleDraftSave = () => persistDraft();

const renderDraft = async (draft) => {
  const result = await readResponse(await fetch("./render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft)
  }));
  const loaded = new Promise((resolve) => site.addEventListener("load", resolve, { once: true }));
  site.src = result.url;
  await loaded;
};

const initializeEditor = async () => {
  const previewDocument = site.contentDocument;
  page = previewDocument?.querySelector(".page");
  if (!page) return;
  if (draftRestorationRunning) return;
  if (!draftRestorationStarted) {
    draftRestorationRunning = true;
    try {
      const state = await readResponse(await fetch("./state", { cache: "no-store" }));
      const serverPayload = pagePayload(state);
      const draft = readRecord(draftKey);
      const recovery = readRecord(recoveryKey);
      const latestDraft = [draft, recovery].filter(isValidDraft)
        .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))[0];
      const draftDiffers = latestDraft && (!samePage(latestDraft, serverPayload) ||
        (latestDraft.versionNameEnabled && latestDraft.versionName));
      const draftIsCurrent = latestDraft && latestDraft.baseRevision === state.revision;
      lastPushed = serverPayload;
      baseRevision = state.revision;
      if (draftDiffers && draftIsCurrent) {
        siteSettings = {
          motif: latestDraft.settings.motif,
          widgets: latestDraft.settings.widgets,
          ui: latestDraft.ui ?? { outlines: false, markdown: false }
        };
        versionNameToggle.setAttribute("aria-pressed", String(Boolean(latestDraft.versionNameEnabled)));
        versionNameInput.hidden = !latestDraft.versionNameEnabled;
        versionNameInput.value = latestDraft.versionName ?? "";
        await renderDraft(latestDraft);
        localStorage.removeItem(draftKey);
        localStorage.removeItem(recoveryKey);
        draftRestorationStarted = true;
        draftRestorationRunning = false;
        await initializeEditor();
        return;
      }
      if (draftDiffers) {
        recoveryDraft = latestDraft;
        if (writeRecord(recoveryKey, latestDraft)) localStorage.removeItem(draftKey);
        recoverButton.hidden = false;
      } else {
        localStorage.removeItem(draftKey);
        localStorage.removeItem(recoveryKey);
      }
      siteSettings.widgets = serverPayload.settings.widgets;
      const motif = previewDocument.querySelector(".floating-motif");
      siteSettings.motif = {
        enabled: motif?.dataset.enabled === "true",
        symbol: motif?.dataset.symbol ?? "",
        count: Number(motif?.dataset.count) || 3
      };
    } catch (error) {
      setStatus(`draft could not be restored: ${error.message}`, true);
      draftRestorationStarted = true;
      draftRestorationRunning = false;
      return;
    }
    draftRestorationStarted = true;
    draftRestorationRunning = false;
  }
  if (initializedPages.has(page)) return;
  initializedPages.add(page);
  previewDocument.body.classList.add("editing");
  page.contentEditable = "true";
  page.spellcheck = true;
  page.setAttribute("aria-label", "Edit your site");
  const editStyle = previewDocument.createElement("style");
  editStyle.textContent = `
    .page[contenteditable=true]{caret-color:#d5d5d5;line-height:1.4}
    .page[contenteditable=true]:focus{outline:none}
    .page.editable-outlines{outline:1px dashed rgb(141 180 255 / 45%);outline-offset:0.5rem}
    .page.editable-outlines :is(h1,h2,h3,h4,h5,h6,p,ul,ol,blockquote,pre,table,hr,figure,img){outline:1px dashed rgb(141 180 255 / 45%);outline-offset:3px}
    .page[contenteditable=true]{pointer-events:auto}
    .media-delete{position:fixed;z-index:12;display:grid;place-items:center;width:1.6rem;height:1.6rem;padding:0;border:1px solid #5a3a3a;border-radius:4px;background:#1a1010;color:#f2b5b5;cursor:pointer;opacity:0;pointer-events:none;transform:scale(.94);transition:opacity 180ms ease,background 180ms ease,transform 180ms ease}
    .media-delete.visible{opacity:1;pointer-events:auto;transform:scale(1)}
    .media-delete:hover{background:#3a1a1a;color:#ffd6d6}
    .media-delete svg{width:0.9rem;height:0.9rem;fill:currentColor}
    .region-overlay{position:fixed;z-index:11;inset:0;cursor:crosshair;background:rgb(0 0 0 / 0)}
    .region-selection{position:absolute;display:none;border:1px solid #8db4ff;background:rgb(141 180 255 / 12%)}
    body.editing .page :is(p,h1,h2,h3,h4,h5,h6,blockquote,pre,hr){margin-block:.3em}
    body.editing .page ul,body.editing .page ol{margin-block:.3em}
    .ascii-art{margin:1.5rem 0;white-space:pre;overflow:auto}
    .ascii-art code{font:inherit;color:var(--text,#dedede);background:transparent}
  `;
  previewDocument.head.append(editStyle);
  previewDocument.addEventListener("selectionchange", rememberTextSelection);
  page.addEventListener("input", (event) => {
    if (!event.isComposing && applyTypedMarkdown(previewDocument, event.target)) {
      updateStatus();
      return;
    }
    updateStatus();
  });
  page.addEventListener("paste", (event) => {
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    const files = [...clipboard.files].filter((file) => mediaExtensions.has(file.type));
    const html = clipboard.getData("text/html");
    const containsInlineMedia = /<(?:img|audio|video)\b[^>]*\bsrc\s*=\s*["']?data:/i.test(html) ||
      /<source\b[^>]*\bsrc\s*=\s*["']?data:/i.test(html);
    if (!files.length && !containsInlineMedia) return;
    event.preventDefault();
    pasteHtml(html, files, previewDocument).catch((error) => {
      setStatus(error.message || "could not upload pasted media", true);
    });
  });
  page.addEventListener("beforeinput", (event) => {
    if (event.inputType === "insertText" && event.data !== null &&
      insertCodeText(previewDocument, event, event.data)) return;
    if (event.inputType !== "insertParagraph") return;
    if (closeMarkdownCodeBlock(previewDocument) ||
      openMarkdownCodeBlock(previewDocument) ||
      exitMarkdownQuote(previewDocument) ||
      exitMarkdownHeading(previewDocument)) {
      event.preventDefault();
      updateStatus();
      return;
    }
    insertCodeText(previewDocument, event, "\n");
  });
  page.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      save();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (moveCaretVertically(previewDocument, event.key === "ArrowUp" ? -1 : 1)) event.preventDefault();
    }
    const media = focusedMedia(previewDocument) ?? selectedMedia(previewDocument);
    if (!media) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      removeMedia(media, previewDocument);
      updateStatus();
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      const range = previewDocument.createRange();
      const before = event.key === "ArrowLeft" || event.key === "ArrowUp";
      if (before) range.setStartBefore(media);
      else range.setStartAfter(media);
      range.collapse(true);
      const selection = previewDocument.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      page.focus();
    }
  });
  installMediaDrop(previewDocument);
  installMediaChrome(previewDocument);
  titleInput.value = previewDocument.title;
  document.title = previewDocument.title;
  const savedUI = siteSettings.ui ?? { outlines: false, markdown: false };
  siteSettings.ui = savedUI;
  const outlineButton = document.querySelector("#toggle-outlines");
  outlineButton.setAttribute("aria-pressed", String(Boolean(savedUI.outlines)));
  page.classList.toggle("editable-outlines", Boolean(savedUI.outlines));
  markdownReference.hidden = !savedUI.markdown;
  document.querySelector("#toggle-markdown").setAttribute("aria-expanded", String(Boolean(savedUI.markdown)));
  syncSettingsForm();
  updateStatus();
  saveButton.disabled = false;
};

const save = async () => {
  if (!page) return;
  const namesVersion = versionNameToggle.getAttribute("aria-pressed") === "true";
  const versionName = versionNameInput.value.trim();
  if (namesVersion && !versionName) {
    setStatus("enter a name for this version", true);
    versionNameInput.focus();
    return;
  }
  saveButton.disabled = true;
  setStatus("saving…");
  try {
    await externalizeInlineMedia(site.contentDocument);
    const markdown = turndown.turndown(page.innerHTML);
    const payload = publishedPayload();
    const result = await readResponse(await fetch("./save", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, content: markdown, versionName: namesVersion ? versionName : "" })
    }));
    const state = await readResponse(await fetch("./state", { cache: "no-store"     }));
    baseRevision = state.revision;
    lastPushed = pagePayload(state);
    localStorage.removeItem(draftKey);
    localStorage.removeItem(recoveryKey);
    recoveryDraft = null;
    recoverButton.hidden = true;
    versionNameInput.value = "";
    versionNameInput.hidden = true;
    versionNameToggle.setAttribute("aria-pressed", "false");
    setStatus(result.message || "saved and pushed to main");
  } catch (error) {
    showPushHelp(error);
    setStatus(error.message || "could not publish", true);
  } finally {
    saveButton.disabled = false;
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
    siteSettings = {
      motif: result.settings.motif,
      widgets: result.settings.widgets ?? defaultWidgets,
      ui: siteSettings.ui ?? { outlines: false, markdown: false }
    };
    localStorage.removeItem(draftKey);
    const state = await readResponse(await fetch("./state", { cache: "no-store" }));
    baseRevision = state.revision;
    lastPushed = pagePayload(state);
    localStorage.removeItem(recoveryKey);
    recoveryDraft = null;
    recoverButton.hidden = true;
    const loaded = new Promise((resolve) => site.addEventListener("load", resolve, { once: true }));
    site.contentWindow.location.reload();
    await loaded;
    versionsDialog.close();
    setStatus("version restored and pushed to main");
  } catch (error) {
    showPushHelp(error);
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

const insertMediaAtRange = (node, range, block) => {
  if (block) {
    const parent = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer
      : range.startContainer.parentElement;
    const blockElement = parent?.closest("p,h1,h2,h3,h4,h5,h6,blockquote,pre");
    if (blockElement?.parentNode) {
      const remainder = range.cloneRange();
      remainder.setEnd(blockElement, blockElement.childNodes.length);
      const trailing = remainder.extractContents();
      const after = blockElement.cloneNode(false);
      after.append(trailing);
      const before = blockElement.innerHTML.trim();
      if (before) blockElement.after(node);
      else blockElement.before(node);
      if (after.innerHTML.trim()) node.after(after);
      if (!blockElement.innerHTML.trim()) blockElement.remove();
      const selection = blockElement.ownerDocument.getSelection();
      const caret = blockElement.ownerDocument.createRange();
      caret.setStartAfter(node);
      caret.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caret);
      return;
    }
  }
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  const selection = node.ownerDocument.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
};

const dropRangeAt = (event, previewDocument) => {
  const position = previewDocument.caretPositionFromPoint?.(event.clientX, event.clientY);
  let range;
  if (position) {
    range = previewDocument.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
  } else {
    range = previewDocument.caretRangeFromPoint?.(event.clientX, event.clientY);
  }
  if (!range || !page.contains(range.startContainer)) {
    range = previewDocument.createRange();
    range.selectNodeContents(page);
    range.collapse(false);
  }
  return range;
};

const resolveExtension = (file) => {
  const rawExtension = file.name.split(".").at(-1)?.toLowerCase();
  const fileExtension = rawExtension === "jpeg" ? "jpg" : rawExtension;
  const extension = mediaExtensions.get(file.type) ??
    (["", "application/octet-stream"].includes(file.type) ? fileExtension : undefined);
  if (!extension) throw new Error("That file type is not supported.");
  const contentType = mediaMimeTypes.get(extension);
  if (!contentType) throw new Error("That file type is not supported.");
  return { extension, contentType };
};

const uploadMediaFile = async (file) => {
  const { extension, contentType } = resolveExtension(file);
  if (file.size > 50 * 1024 * 1024) throw new Error("Media files must be smaller than 50 MB.");
  const name = `${crypto.randomUUID()}.${extension}`;
  const response = await fetch(`./upload/${name}`, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file
  });
  if (!response.ok) throw new Error(await response.text());
  return { name, source: `/preview/media/${name}`, contentType };
};

const dataUrlToFile = async (url, name) => {
  const response = await fetch(url);
  const blob = await response.blob();
  const extension = mediaExtensions.get(blob.type);
  if (!extension) throw new Error("That pasted media type is not supported.");
  return new File([blob], name || `pasted-media.${extension}`, { type: blob.type });
};

const buildMediaNode = (previewDocument, file, source, contentType) => {
  let node;
  let isBlock = false;
  if (contentType.startsWith("image/")) {
    node = previewDocument.createElement("img");
    node.src = source;
    node.alt = file.name;
    node.contentEditable = "false";
    node.tabIndex = 0;
    node.setAttribute("aria-label", `Image: ${file.name}`);
  } else {
    isBlock = true;
    const figure = previewDocument.createElement("figure");
    figure.contentEditable = "false";
    figure.className = contentType.startsWith("audio/") ? "audio-embed" : "video-embed";
    figure.tabIndex = 0;
    figure.setAttribute("aria-label", `${contentType.startsWith("audio/") ? "Audio" : "Video"}: ${file.name}`);
    const caption = previewDocument.createElement("figcaption");
    caption.textContent = file.name;
    const player = previewDocument.createElement(contentType.startsWith("audio/") ? "audio" : "video");
    player.controls = true;
    player.autoplay = contentType.startsWith("audio/");
    player.playsInline = true;
    player.preload = "metadata";
    const mediaSource = previewDocument.createElement("source");
    mediaSource.src = source;
    mediaSource.type = contentType;
    player.append(mediaSource);
    figure.append(caption, player);
    if (contentType.startsWith("video/")) {
      const expand = previewDocument.createElement("button");
      expand.type = "button";
      expand.className = "video-expand";
      expand.textContent = "expand";
      figure.append(expand);
    }
    node = figure;
  }
  return { node, isBlock };
};

const insertUploadedFile = async (file, event, previewDocument) => {
  const uploaded = await uploadMediaFile(file);
  const { node, isBlock } = buildMediaNode(previewDocument, file, uploaded.source, uploaded.contentType);
  const range = dropRangeAt(event, previewDocument);
  insertMediaAtRange(node, range, isBlock);
  setStatus("media added · unsaved");
  scheduleDraftSave();
};

const inlineDataUrl = (node) => {
  if (node.matches("img, audio, video") && node.src?.startsWith("data:")) return node.src;
  return node.matches("audio, video")
    ? node.querySelector("source[src^='data:']")?.src
    : undefined;
};

const pasteHtml = async (html, files, previewDocument) => {
  const range = previewDocument.getSelection()?.getRangeAt(0)?.cloneRange();
  if (!range || !page.contains(range.startContainer)) return;
  if (files.length) {
    for (const file of files) {
      const uploaded = await uploadMediaFile(file);
      const { node, isBlock } = buildMediaNode(previewDocument, file, uploaded.source, uploaded.contentType);
      insertMediaAtRange(node, previewDocument.getSelection()?.getRangeAt(0) ?? range, isBlock);
    }
    updateStatus();
    return;
  }
  const fragment = range.createContextualFragment(html);
  const nodes = [...fragment.querySelectorAll("img, audio, video")];
  for (const node of nodes) {
    const url = inlineDataUrl(node);
    if (!url) continue;
    const file = await dataUrlToFile(url, node.getAttribute("alt") || node.getAttribute("title"));
    const uploaded = await uploadMediaFile(file);
    const { node: media, isBlock } = buildMediaNode(previewDocument, file, uploaded.source, uploaded.contentType);
    node.replaceWith(media);
    if (isBlock) media.contentEditable = "false";
  }
  range.deleteContents();
  range.insertNode(fragment);
  range.collapse(false);
  const selection = previewDocument.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  updateStatus();
};

const externalizeInlineMedia = async (previewDocument) => {
  for (const node of page.querySelectorAll("img, audio, video")) {
    const url = inlineDataUrl(node);
    if (!url) continue;
    const file = await dataUrlToFile(url, node.getAttribute("alt") || node.getAttribute("title"));
    const uploaded = await uploadMediaFile(file);
    const { node: replacement } = buildMediaNode(previewDocument, file, uploaded.source, uploaded.contentType);
    node.replaceWith(replacement);
  }
};

const regionRange = (previewDocument, box) => {
  const position = previewDocument.caretPositionFromPoint?.(box.x, box.y);
  if (position && page.contains(position.offsetNode)) {
    const range = previewDocument.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }
  const range = previewDocument.caretRangeFromPoint?.(box.x, box.y);
  if (range && page.contains(range.startContainer)) return range;
  const fallback = previewDocument.createRange();
  fallback.selectNodeContents(page);
  fallback.collapse(false);
  return fallback;
};

const applyFit = (node, isBlock, box) => {
  const width = Math.max(8, Math.round(box.w));
  const height = Math.max(8, Math.round(box.h));
  const target = isBlock ? node.querySelector("audio, video") : node;
  if (target) {
    target.style.maxWidth = `${width}px`;
    target.style.maxHeight = `${height}px`;
    target.style.objectFit = "contain";
  }
  node.setAttribute("data-fit-w", String(width));
  node.setAttribute("data-fit-h", String(height));
};

const insertRegionFile = async (file, box) => {
  const previewDocument = site.contentDocument;
  if (!previewDocument || !page) return;
  const uploaded = await uploadMediaFile(file);
  const { node, isBlock } = buildMediaNode(previewDocument, file, uploaded.source, uploaded.contentType);
  applyFit(node, isBlock, box);
  const range = regionRange(previewDocument, box);
  insertMediaAtRange(node, range, isBlock);
  setStatus("media added · unsaved");
  scheduleDraftSave();
};

const insertRegionAscii = (text, box) => {
  const previewDocument = site.contentDocument;
  if (!previewDocument || !page) return;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const longest = Math.max(1, ...lines.map((line) => line.length));
  const width = Math.max(8, box.w);
  const height = Math.max(8, box.h);
  const fontSize = Math.min(40, Math.max(1, Math.floor(Math.min(width / (longest * 0.62), height / (lines.length * 1.45)))));
  const pre = previewDocument.createElement("pre");
  pre.className = `ascii-art language-ascii-fit-${Math.round(width)}x${Math.round(height)}`;
  pre.style.fontSize = `${fontSize}px`;
  pre.style.lineHeight = "1.4";
  pre.style.maxWidth = `${Math.round(width)}px`;
  pre.style.overflow = "auto";
  const code = previewDocument.createElement("code");
  code.className = `language-ascii-fit-${Math.round(width)}x${Math.round(height)}`;
  code.textContent = text.replace(/\n$/, "");
  pre.append(code);
  const range = regionRange(previewDocument, box);
  insertMediaAtRange(pre, range, true);
  setStatus("ascii added · unsaved");
  scheduleDraftSave();
};

const focusedMedia = (previewDocument) => {
  const active = previewDocument.activeElement;
  if (!active || active === previewDocument.body || active === previewDocument.documentElement) return null;
  const element = active.nodeType === 1 ? active : active.parentElement;
  const media = element && (element.nodeName === "IMG" ? element : element.closest("figure.audio-embed, figure.video-embed"));
  return media && page.contains(media) ? media : null;
};

const selectedMedia = (previewDocument) => {
  const selection = previewDocument.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const node = selection.anchorNode;
  if (!node) return null;
  const element = node.nodeType === 1 ? node : node.parentElement;
  const media = element && (element.nodeName === "IMG" ? element : element.closest("figure.audio-embed, figure.video-embed"));
  return media && page.contains(media) ? media : null;
};

const removeMedia = (target, previewDocument) => {
  const removable = target.parentElement?.matches("p") &&
    target.parentElement.children.length === 1 &&
    !target.parentElement.textContent.trim()
    ? target.parentElement
    : target;
  const range = previewDocument.createRange();
  range.setStartBefore(removable);
  range.collapse(true);
  removable.remove();
  page.focus({ preventScroll: true });
  const selection = previewDocument.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
};

const caretTextContext = (previewDocument) => {
  const selection = previewDocument.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (range.startContainer.nodeType !== Node.TEXT_NODE || !page.contains(range.startContainer)) return null;
  const caretNode = range.startContainer;
  const caretOffset = range.startOffset;
  let block = caretNode.parentElement?.closest("p,div,li,h1,h2,h3,h4,h5,h6");
  if (!block) {
    const parent = caretNode.parentElement;
    if (parent !== page) return null;
    block = previewDocument.createElement("p");
    caretNode.replaceWith(block);
    block.append(caretNode);
    const restored = previewDocument.createRange();
    restored.setStart(caretNode, Math.min(caretOffset, caretNode.textContent.length));
    restored.collapse(true);
    selection.removeAllRanges();
    selection.addRange(restored);
  }
  if (!block || block === page || block.closest(".code-block,pre")) return null;
  const prefixRange = previewDocument.createRange();
  prefixRange.selectNodeContents(block);
  prefixRange.setEnd(caretNode, caretOffset);
  return {
    selection,
    block,
    prefix: prefixRange.toString().replaceAll("\u00a0", " ")
  };
};

const textRange = (previewDocument, container, start, end) => {
  const walker = previewDocument.createTreeWalker(container, previewDocument.defaultView.NodeFilter.SHOW_TEXT);
  const nodes = [];
  let length = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    nodes.push({ node, start: length, end: length + node.textContent.length });
    length += node.textContent.length;
  }
  const pointAt = (offset) => {
    const entry = nodes.find((item) => offset <= item.end);
    if (entry) return [entry.node, Math.max(0, offset - entry.start)];
    const last = nodes.at(-1);
    return last ? [last.node, last.node.textContent.length] : [container, 0];
  };
  const range = previewDocument.createRange();
  const [startNode, startOffset] = pointAt(start);
  const [endNode, endOffset] = pointAt(end);
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
};

const replaceTextRange = (previewDocument, context, start, end, nodes) => {
  const range = textRange(previewDocument, context.block, start, end);
  range.deleteContents();
  const fragment = previewDocument.createDocumentFragment();
  for (const node of nodes) fragment.append(node);
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last) {
    range.setStartAfter(last);
    range.collapse(true);
    context.selection.removeAllRanges();
    context.selection.addRange(range);
  }
};

const setCaretAtTextOffset = (previewDocument, selection, block, offset) => {
  const caret = textRange(previewDocument, block, offset, offset);
  caret.collapse(true);
  selection.removeAllRanges();
  selection.addRange(caret);
};

const createEditableParagraph = (previewDocument) => {
  const paragraph = previewDocument.createElement("p");
  paragraph.append(previewDocument.createElement("br"));
  return paragraph;
};

const applyBlockMarkdown = (previewDocument, block, selection) => {
  const text = block.textContent.replaceAll("\u00a0", " ");
  const heading = text.match(/^ {0,3}(#{1,6})[ \t]+(.*)$/);
  const list = text.match(/^([-*+]|\d+\.)[ \t]+(.*)$/);
  const quote = text.match(/^>[ \t]+(.*)$/);
  const divider = /^(---|\*\*\*|___)[ \t]*$/.test(text);
  if ((heading && !heading[2]) || (quote && !quote[1])) return false;
  if (!heading && !list && !quote && !divider) return false;

  const doc = block.ownerDocument;
  if (heading) {
    const replacement = doc.createElement(`h${heading[1].length}`);
    while (block.firstChild) replacement.append(block.firstChild);
    block.replaceWith(replacement);
    const prefixLength = heading[0].length - heading[2].length;
    const range = textRange(doc, replacement, 0, prefixLength);
    range.deleteContents();
    if (!replacement.textContent) replacement.append(doc.createElement("br"));
    setCaretAtTextOffset(doc, selection, replacement, text.length - prefixLength);
    return true;
  }
  if (list) {
    const listElement = doc.createElement(/^\d/.test(list[1]) ? "ol" : "ul");
    const item = doc.createElement("li");
    if (list[2]) item.textContent = list[2];
    listElement.append(item);
    block.replaceWith(listElement);
    setCaretAtTextOffset(doc, selection, item, list[2].length);
    return true;
  }
  const replacement = divider ? doc.createElement("hr") : doc.createElement("blockquote");
  const paragraph = divider ? createEditableParagraph(doc) : doc.createElement("p");
  if (!divider) {
    while (block.firstChild) paragraph.append(block.firstChild);
    if (!paragraph.hasChildNodes()) paragraph.append(doc.createElement("br"));
    replacement.append(paragraph);
  }
  block.replaceWith(replacement);
  if (divider) replacement.after(paragraph);
  if (quote) {
    const prefixLength = quote[0].length - quote[1].length;
    const range = textRange(doc, paragraph, 0, prefixLength);
    range.deleteContents();
    setCaretAtTextOffset(doc, selection, paragraph, text.length - prefixLength);
  } else {
    setCaretAtTextOffset(doc, selection, paragraph, 0);
  }
  return true;
};

const openMarkdownCodeBlock = (previewDocument) => {
  const context = caretTextContext(previewDocument);
  if (!context || context.block.textContent !== context.prefix) return false;
  const fence = context.prefix.match(/^```([a-z0-9_+#.-]*)$/i);
  if (!fence) return false;
  const doc = context.block.ownerDocument;
  const wrapper = doc.createElement("div");
  wrapper.className = "code-block";
  const language = doc.createElement("span");
  language.className = "code-language";
  language.textContent = fence[1] || "text";
  const pre = doc.createElement("pre");
  const code = doc.createElement("code");
  code.append(doc.createTextNode(""));
  pre.append(code);
  wrapper.append(language, pre);
  context.block.replaceWith(wrapper);
  const range = doc.createRange();
  range.setStart(code.firstChild, 0);
  range.collapse(true);
  context.selection.removeAllRanges();
  context.selection.addRange(range);
  return true;
};

const insertCodeText = (previewDocument, event, text) => {
  const selection = previewDocument.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!page.contains(range.startContainer)) return false;
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement;
  const code = element?.closest(".code-block pre code");
  if (!code || !code.contains(range.endContainer)) return false;
  event.preventDefault();
  const inserted = previewDocument.createTextNode(text);
  range.deleteContents();
  range.insertNode(inserted);
  range.setStartAfter(inserted);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  updateStatus();
  return true;
};

const closeMarkdownCodeBlock = (previewDocument) => {
  const selection = previewDocument.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!page.contains(range.startContainer)) return false;
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement;
  const code = element?.closest(".code-block pre code");
  const wrapper = code?.closest(".code-block");
  if (!wrapper) return false;
  const beforeRange = previewDocument.createRange();
  beforeRange.selectNodeContents(code);
  beforeRange.setEnd(range.startContainer, range.startOffset);
  const afterRange = previewDocument.createRange();
  afterRange.selectNodeContents(code);
  afterRange.setStart(range.startContainer, range.startOffset);
  const beforeCaret = beforeRange.toString();
  if (afterRange.toString().length) return false;
  if (beforeCaret.endsWith("```")) {
    const fenceStart = beforeCaret.length - 3;
    textRange(previewDocument, code, fenceStart, fenceStart + 3).deleteContents();
  } else if (beforeCaret.endsWith("\n")) {
    textRange(previewDocument, code, beforeCaret.length - 1, beforeCaret.length).deleteContents();
  } else if (beforeCaret.length) {
    return false;
  }
  const paragraph = createEditableParagraph(previewDocument);
  wrapper.after(paragraph);
  const caret = previewDocument.createRange();
  caret.setStart(paragraph, 0);
  caret.collapse(true);
  selection.removeAllRanges();
  selection.addRange(caret);
  return true;
};

const exitMarkdownQuote = (previewDocument) => {
  const selection = previewDocument.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!page.contains(range.startContainer)) return false;
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement;
  const paragraph = element?.closest("p");
  const quote = paragraph?.closest("blockquote");
  if (!quote || paragraph.textContent.replaceAll("\u00a0", " ").trim()) return false;
  paragraph.remove();
  const replacement = createEditableParagraph(previewDocument);
  if (quote.textContent.trim()) quote.after(replacement);
  else quote.replaceWith(replacement);
  const caret = previewDocument.createRange();
  caret.setStart(replacement, 0);
  caret.collapse(true);
  selection.removeAllRanges();
  selection.addRange(caret);
  return true;
};

const exitMarkdownHeading = (previewDocument) => {
  const selection = previewDocument.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!page.contains(range.startContainer)) return false;
  const element = range.startContainer.nodeType === Node.ELEMENT_NODE
    ? range.startContainer
    : range.startContainer.parentElement;
  const heading = element?.closest("h1,h2,h3,h4,h5,h6");
  if (!heading) return false;
  const beforeCaret = previewDocument.createRange();
  beforeCaret.selectNodeContents(heading);
  beforeCaret.setEnd(range.startContainer, range.startOffset);
  if (beforeCaret.toString() !== heading.textContent) return false;
  const paragraph = createEditableParagraph(previewDocument);
  heading.after(paragraph);
  const caret = previewDocument.createRange();
  caret.setStart(paragraph, 0);
  caret.collapse(true);
  selection.removeAllRanges();
  selection.addRange(caret);
  return true;
};

const applyInlineMarkdown = (previewDocument, block, selection) => {
  const before = block.textContent.replaceAll("\u00a0", " ");
  if (before.startsWith("```")) return false;
  const linkMatch = before.match(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)(\s*)$/);
  if (linkMatch) {
    let url;
    try {
      url = new URL(linkMatch[2]);
    } catch {
      return false;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const link = previewDocument.createElement("a");
    link.href = url.href;
    link.textContent = linkMatch[1];
    replaceTextRange(previewDocument, { block, selection },
      before.length - linkMatch[0].length,
      before.length,
      [link, previewDocument.createTextNode(linkMatch[3])]);
    return true;
  }
  const patterns = [
    [/(\*\*\*)(.+?)\1(\s*)$/, ["strong", "em"]],
    [/(\*\*)(.+?)\1(\s*)$/, "strong"],
    [/(__)(.+?)\1(\s*)$/, "u"],
    [/(~~)(.+?)\1(\s*)$/, "del"],
    [/(\|\|)(.+?)\1(\s*)$/, "span"],
    [/(`)(.+?)\1(\s*)$/, "code"],
    [/(?<!\*)(\*)(?!\*)(.+?)(?<!\*)\1(?!\*)(\s*)$/, "em"],
    [/(?<!_)(_)(?!_)(.+?)(?<!_)\1(?!_)(\s*)$/, "em"]
  ];
  const match = patterns.map(([pattern, tag]) => ({ match: before.match(pattern), tag }))
    .find((candidate) => candidate.match);
  if (!match) return false;
  const start = before.length - match.match[0].length;
  const doc = block.ownerDocument;
  const tags = Array.isArray(match.tag) ? match.tag : [match.tag];
  let replacement = doc.createTextNode(match.match[2]);
  for (const tag of tags.reverse()) {
    const element = doc.createElement(tag);
    if (tag === "span") element.className = "spoiler";
    element.append(replacement);
    replacement = element;
  }
  const context = { block, selection };
  replaceTextRange(previewDocument, context, start, before.length, [
    replacement,
    doc.createTextNode(match.match[3] ?? "")
  ]);
  return true;
};

const applyTypedMarkdown = (previewDocument, target) => {
  const selection = previewDocument.getSelection();
  const selectionNode = selection?.anchorNode;
  const targetElement = target?.nodeType === 1 ? target : target?.parentElement;
  let block = targetElement?.closest("p,div,li,h1,h2,h3,h4,h5,h6");
  if (!block && selectionNode && page.contains(selectionNode)) {
    const element = selectionNode.nodeType === 1 ? selectionNode : selectionNode.parentElement;
    block = element?.closest("p,div,li,h1,h2,h3,h4,h5,h6");
    const rootText = selectionNode.nodeType === Node.TEXT_NODE && selectionNode.parentElement === page
      ? selectionNode
      : selectionNode === page
        ? selectionNode.childNodes[selection.anchorOffset - 1]?.nodeType === Node.TEXT_NODE
          ? selectionNode.childNodes[selection.anchorOffset - 1]
          : selectionNode.childNodes[selection.anchorOffset]?.nodeType === Node.TEXT_NODE
            ? selectionNode.childNodes[selection.anchorOffset]
            : null
        : null;
    if (!block && rootText) {
      const offset = selectionNode === rootText ? selection.anchorOffset : rootText.textContent.length;
      block = previewDocument.createElement("p");
      rootText.replaceWith(block);
      block.append(rootText);
      const caret = previewDocument.createRange();
      caret.setStart(rootText, Math.min(offset, rootText.textContent.length));
      caret.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caret);
    }
  }
  if (!block || block.closest(".code-block,pre")) return false;
  if (applyBlockMarkdown(previewDocument, block, selection)) return true;
  return applyInlineMarkdown(previewDocument, block, selection);
};

const moveCaretVertically = (previewDocument, direction) => {
  const selection = previewDocument.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return false;
  const current = selection.getRangeAt(0);
  if (!page.contains(current.startContainer)) return false;
  if (typeof selection.modify === "function") {
    const original = current.cloneRange();
    selection.modify("move", direction < 0 ? "backward" : "forward", "line");
    const moved = selection.getRangeAt(0);
    if (page.contains(moved.startContainer) &&
      (moved.startContainer !== original.startContainer || moved.startOffset !== original.startOffset)) {
      return true;
    }
    selection.removeAllRanges();
    selection.addRange(original);
  }
  const fallbackRange = selection.getRangeAt(0);
  const caret = fallbackRange.getBoundingClientRect();
  if (!caret.height) return false;
  const lineHeight = Number.parseFloat(getComputedStyle(fallbackRange.startContainer.parentElement ?? page).lineHeight) || caret.height;
  const point = previewDocument.caretPositionFromPoint?.(caret.left, caret.top + direction * lineHeight);
  const next = point
    ? previewDocument.createRange()
    : previewDocument.caretRangeFromPoint?.(caret.left, caret.top + direction * lineHeight);
  if (point) {
    next.setStart(point.offsetNode, point.offset);
    next.collapse(true);
  }
  if (!next || !page.contains(next.startContainer)) return false;
  selection.removeAllRanges();
  selection.addRange(next);
  return true;
};

const installMediaChrome = (previewDocument) => {
  const bin = previewDocument.createElement("button");
  bin.type = "button";
  bin.className = "media-delete";
  bin.setAttribute("aria-label", "Delete media");
  bin.innerHTML = '<svg aria-hidden="true" viewBox="0 0 16 16"><path d="M5 1h6l.6 1.5H15v1.7H1V2.5h3.4L5 1Zm-2.2 4h10.4l-.7 9.5H3.5L2.8 5Zm2 1.5.4 6h1.3l-.3-6H4.8Zm3 0-.1 6h1.3l.2-6H7.8Z"/></svg>';
  previewDocument.body.append(bin);
  let target = null;

  const mediaAt = (node) => {
    if (!node || node.nodeType !== 1) return null;
    const anchor = node.matches("img, audio, video") ? node : null;
    if (!anchor) return null;
    const container = anchor.closest("figure.audio-embed, figure.video-embed") ?? anchor;
    if (container.tabIndex < 0) container.tabIndex = 0;
    if (!container.hasAttribute("aria-label")) {
      container.setAttribute("aria-label", anchor.nodeName === "IMG" ? "Image" : anchor.nodeName === "AUDIO" ? "Audio" : "Video");
    }
    return { anchor, container };
  };

  const positionBin = () => {
    if (!target?.anchor.isConnected) return;
    const rect = target.anchor.getBoundingClientRect();
    bin.style.top = `${Math.max(4, Math.min(rect.bottom - 30, rect.top + 6))}px`;
    bin.style.left = `${Math.max(4, Math.min(previewDocument.defaultView.innerWidth - 30, rect.right - 30))}px`;
    bin.classList.add("visible");
  };

  const hideBin = () => {
    target = null;
    bin.classList.remove("visible");
  };

  bin.addEventListener("click", () => {
    if (!target) return;
    removeMedia(target.container, previewDocument);
    target = null;
    bin.classList.remove("visible");
    updateStatus();
    persistDraft();
  });
  bin.addEventListener("mouseleave", (event) => {
    if (!target?.anchor.contains(event.relatedTarget)) hideBin();
  });

  previewDocument.addEventListener("pointerover", (event) => {
    const media = mediaAt(event.target);
    if (media) {
      target = media;
      positionBin();
    }
  }, true);

  previewDocument.addEventListener("pointerout", (event) => {
    if (!target) return;
    const next = event.relatedTarget;
    if (next && (target.anchor.contains(next) || bin.contains(next))) return;
    if (event.target === target.anchor || target.anchor.contains(event.target)) hideBin();
  }, true);
  previewDocument.defaultView.addEventListener("scroll", positionBin, true);
  previewDocument.defaultView.addEventListener("resize", positionBin);
};

const startRegion = () => {
  const previewDocument = site.contentDocument;
  if (!previewDocument || !page || regionMode) return;
  regionMode = true;
  regionButton.setAttribute("aria-pressed", "true");
  regionOverlay = previewDocument.createElement("div");
  regionOverlay.className = "region-overlay";
  regionOverlay.setAttribute("tabindex", "0");
  regionSelection = previewDocument.createElement("div");
  regionSelection.className = "region-selection";
  regionOverlay.append(regionSelection);
  previewDocument.body.append(regionOverlay);
  let start = { x: 0, y: 0 };

  const update = (event) => {
    const x = Math.min(start.x, event.clientX);
    const y = Math.min(start.y, event.clientY);
    regionBox = {
      x,
      y,
      w: Math.abs(event.clientX - start.x),
      h: Math.abs(event.clientY - start.y)
    };
    regionSelection.style.display = "block";
    regionSelection.style.left = `${x}px`;
    regionSelection.style.top = `${y}px`;
    regionSelection.style.width = `${regionBox.w}px`;
    regionSelection.style.height = `${regionBox.h}px`;
  };

  const cancel = () => {
    regionOverlay?.remove();
    regionOverlay = null;
    regionSelection = null;
    regionMode = false;
    regionButton.setAttribute("aria-pressed", "false");
    regionBox = null;
  };

  const finish = () => {
    regionOverlay?.remove();
    regionOverlay = null;
    regionSelection = null;
    regionMode = false;
    regionButton.setAttribute("aria-pressed", "false");
    if (!regionBox || regionBox.w < 10 || regionBox.h < 10) {
      regionBox = null;
      setStatus("region was too small", true);
      return;
    }
    setRegionKind("image");
    regionDialog.showModal();
  };

  regionOverlay.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY };
    const move = (moveEvent) => update(moveEvent);
    const up = (upEvent) => {
      update(upEvent);
      regionOverlay.removeEventListener("pointermove", move);
      regionOverlay.removeEventListener("pointerup", up);
      finish();
    };
    regionOverlay.addEventListener("pointermove", move);
    regionOverlay.addEventListener("pointerup", up);
  });
  regionOverlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cancel();
  });
  regionOverlay.focus();
};

const setRegionKind = (kind) => {
  regionFile.accept = kind === "video"
    ? "video/mp4,video/webm,video/quicktime"
    : "image/png,image/jpeg,image/gif,image/webp";
  regionFile.hidden = kind === "ascii";
  regionAsciiInput.hidden = kind !== "ascii";
  regionPlace.hidden = kind !== "ascii";
};

const installMediaDrop = (previewDocument) => {
  previewDocument.addEventListener("dragenter", (event) => {
    if ([...event.dataTransfer.types].includes("Files")) {
      event.preventDefault();
      dropOverlay.classList.add("visible");
    }
  }, true);
  previewDocument.addEventListener("dragover", (event) => {
    if ([...event.dataTransfer.types].includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      dropOverlay.classList.add("visible");
    }
  }, true);
  previewDocument.addEventListener("dragleave", (event) => {
    if (!previewDocument.documentElement.contains(event.relatedTarget)) dropOverlay.classList.remove("visible");
  }, true);
  previewDocument.addEventListener("drop", async (event) => {
    if (![...event.dataTransfer.types].includes("Files")) return;
    event.preventDefault();
    event.stopPropagation();
    dropOverlay.classList.remove("visible");
    const files = [...event.dataTransfer.files];
    if (!files.length) {
      setStatus("No file data received from the drop.", true);
      return;
    }
    for (const file of files) {
      try {
        await insertUploadedFile(file, event, previewDocument);
      } catch (error) {
        setStatus(error.message || "media upload failed", true);
      }
    }
  }, true);
};

const setSettingsCategory = (category) => {
  for (const button of document.querySelectorAll("[data-category]")) {
    button.setAttribute("aria-pressed", String(button.dataset.category === category));
  }
  for (const panel of document.querySelectorAll("[data-settings]")) {
    panel.hidden = panel.dataset.settings !== category;
  }
};

const closeOnBackdrop = (dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
};

site.addEventListener("load", initializeEditor);
if (site.contentDocument?.readyState === "complete") initializeEditor();
titleInput.addEventListener("input", () => {
  const title = titleInput.value.trim() || "home";
  if (site.contentDocument) site.contentDocument.title = title;
  document.title = title;
  updateStatus();
});
titleInput.addEventListener("blur", () => {
  if (!titleInput.value.trim()) titleInput.value = "home";
  if (site.contentDocument) site.contentDocument.title = titleInput.value;
  document.title = titleInput.value;
  updateStatus();
});
versionNameToggle.addEventListener("click", () => {
  const enabled = versionNameToggle.getAttribute("aria-pressed") !== "true";
  versionNameToggle.setAttribute("aria-pressed", String(enabled));
  versionNameInput.hidden = !enabled;
  if (enabled) versionNameInput.focus();
  updateStatus();
  persistDraft();
});
versionNameInput.addEventListener("input", () => {
  updateStatus();
  persistDraft();
});
textColorToggle.addEventListener("click", () => {
  const expanded = textColorToggle.getAttribute("aria-expanded") !== "true";
  textColorToggle.setAttribute("aria-expanded", String(expanded));
  textColorPanel.hidden = !expanded;
});
document.querySelectorAll(".color-presets button").forEach((button) => {
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => applyTextColor(button.dataset.color));
});
textColorWheel.addEventListener("change", (event) => applyTextColor(event.currentTarget.value));
document.querySelector("#toggle-markdown").addEventListener("click", (event) => {
  const reference = document.querySelector("#markdown-reference");
  reference.hidden = !reference.hidden;
  event.currentTarget.setAttribute("aria-expanded", String(!reference.hidden));
  siteSettings.ui.markdown = !reference.hidden;
  persistDraft();
});
document.querySelector("#edit-source").addEventListener("click", () => {
  sourceInput.value = publishedPayload().content;
  sourceDialog.showModal();
  sourceInput.focus();
});
document.querySelector("#apply-source").addEventListener("click", async () => {
  try {
    await renderDraft({
      content: sourceInput.value,
      title: titleInput.value.trim() || "home",
      settings: siteSettings
    });
    sourceDialog.close();
  } catch (error) {
    setStatus(error.message || "could not render Markdown source", true);
  }
});
document.querySelector("#cancel-source").addEventListener("click", () => sourceDialog.close());
document.querySelector("#toggle-outlines").addEventListener("click", (event) => {
  const enabled = event.currentTarget.getAttribute("aria-pressed") !== "true";
  event.currentTarget.setAttribute("aria-pressed", String(enabled));
  page?.classList.toggle("editable-outlines", enabled);
  siteSettings.ui.outlines = enabled;
  updateStatus();
  persistDraft();
});
document.querySelector("#open-settings").addEventListener("click", () => {
  syncSettingsForm();
  setSettingsCategory("general");
  settingsDialog.showModal();
});
document.querySelectorAll("[data-category]").forEach((button) => {
  button.addEventListener("click", () => setSettingsCategory(button.dataset.category));
});
document.querySelectorAll('[data-settings="site"] input, [data-settings="site"] select').forEach((input) => {
  input.addEventListener(input.type === "checkbox" || input.tagName === "SELECT" ? "change" : "input", () => {
    siteSettings.widgets = siteWidgetsFromForm();
    updateStatus();
    persistDraft();
  });
});
document.querySelector("#setting-outlines").addEventListener("change", (event) => {
  siteSettings.ui.outlines = event.currentTarget.checked;
  document.querySelector("#toggle-outlines").setAttribute("aria-pressed", String(event.currentTarget.checked));
  page?.classList.toggle("editable-outlines", event.currentTarget.checked);
  updateStatus();
  persistDraft();
});
document.querySelector("#setting-markdown").addEventListener("change", (event) => {
  siteSettings.ui.markdown = event.currentTarget.checked;
  markdownReference.hidden = !event.currentTarget.checked;
  document.querySelector("#toggle-markdown").setAttribute("aria-expanded", String(event.currentTarget.checked));
  updateStatus();
  persistDraft();
});
document.querySelector("#motif-symbol").addEventListener("input", (event) => {
  siteSettings.motif.symbol = event.currentTarget.value;
  siteSettings.motif.enabled = document.querySelector("#motif-enabled").checked;
  updateStatus();
});
document.querySelector("#motif-enabled").addEventListener("change", (event) => {
  siteSettings.motif.enabled = event.currentTarget.checked;
  siteSettings.motif.symbol = document.querySelector("#motif-symbol").value;
  updateStatus();
});
motifCountInput.addEventListener("input", (event) => {
  siteSettings.motif.count = Number(event.currentTarget.value);
  motifCountValue.value = event.currentTarget.value;
  motifCountValue.textContent = event.currentTarget.value;
  updateStatus();
});
motifCountInput.addEventListener("change", async () => {
  try {
    await renderDraft(draftPayload());
  } catch (error) {
    setStatus(error.message || "could not preview floating text", true);
  }
});
document.querySelector("#apply-settings").addEventListener("click", applySettings);
document.querySelector("#close-settings").addEventListener("click", () => settingsDialog.close());
document.querySelector("#open-versions").addEventListener("click", async () => {
  versionsDialog.showModal();
  try {
    await loadVersions();
  } catch (error) {
    setStatus(error.message || "could not load versions", true);
  }
});
document.querySelector("#close-versions").addEventListener("click", () => versionsDialog.close());
closeOnBackdrop(versionsDialog);
closeOnBackdrop(settingsDialog);
closeOnBackdrop(sourceDialog);
closeOnBackdrop(pushHelpDialog);
closeOnBackdrop(regionDialog);
saveButton.addEventListener("click", save);
document.querySelector("#copy-push-command").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(pushHelpCommand.textContent);
    setStatus("command copied");
  } catch {
    setStatus("copy unavailable · select the command above", true);
  }
});
document.querySelector("#retry-push").addEventListener("click", () => {
  pushHelpDialog.close();
  save();
});
document.querySelector("#close-push-help").addEventListener("click", () => pushHelpDialog.close());
recoverButton.addEventListener("click", async () => {
  const draft = recoveryDraft ?? readRecord(recoveryKey);
  if (!draft) return;
  try {
    siteSettings = {
      motif: draft.settings.motif,
      widgets: draft.settings.widgets ?? defaultWidgets,
      ui: draft.ui ?? { outlines: false, markdown: false }
    };
    versionNameToggle.setAttribute("aria-pressed", String(Boolean(draft.versionNameEnabled)));
    versionNameInput.hidden = !draft.versionNameEnabled;
    versionNameInput.value = draft.versionName ?? "";
    titleInput.value = draft.title;
    document.title = draft.title;
    await renderDraft(draft);
    localStorage.removeItem(recoveryKey);
    recoveryDraft = null;
    recoverButton.hidden = true;
    updateStatus();
    persistDraft();
  } catch (error) {
    setStatus(error.message || "could not restore the browser draft", true);
  }
});
window.addEventListener("beforeunload", persistDraft);
window.addEventListener("pagehide", persistDraft);
regionButton.addEventListener("click", startRegion);
regionImage.addEventListener("click", () => {
  setRegionKind("image");
  regionFile.click();
});
regionVideo.addEventListener("click", () => {
  setRegionKind("video");
  regionFile.click();
});
regionAscii.addEventListener("click", () => setRegionKind("ascii"));
regionFile.addEventListener("change", async () => {
  const file = regionFile.files?.[0];
  regionFile.value = "";
  if (!file || !regionBox) return;
  try {
    await insertRegionFile(file, regionBox);
    regionDialog.close();
  } catch (error) {
    setStatus(error.message || "could not place media", true);
  }
});
regionPlace.addEventListener("click", () => {
  const text = regionAsciiInput.value;
  if (!text.trim()) {
    setStatus("paste some ascii art first", true);
    return;
  }
  insertRegionAscii(text, regionBox);
  regionAsciiInput.value = "";
  regionDialog.close();
});
regionCancel.addEventListener("click", () => regionDialog.close());
