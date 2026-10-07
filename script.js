"use strict";

/* =========================================================
   Налаштування експорту (логіка вивантаження як і раніше:
   JPG 1200×1200, білий фон, відступ 50px, назви префікс_N.jpg)
   ========================================================= */
const OUTPUT_SIZE = 1200;
const OUTPUT_PADDING = 50;
const OUTPUT_QUALITY = 1.0;
const DEFAULT_PREFIX = "image";

/* remove.bg */
const REMOVE_BG_API_KEY = "XqDCHZChV2MxuyvdxgyNMr7P";
const REMOVE_BG_PIN = "1456";

const HISTORY_LIMIT = 20;
const LOW_RES_WARNING = 600;
const THUMB_SIZE = 480;

const OP_LABELS = {
  crop: "Обрізка",
  transform: "Поворот",
  center: "Зсув",
  pen: "Перо",
  bg: "Без фону"
};

/* =========================================================
   Елементи
   ========================================================= */
const $ = (sel, root = document) => root.querySelector(sel);

const imageInput = $("#imageInput");
const codeInput = $("#codeInput");
const namePreview = $("#namePreview");
const paddingSwitch = $("#paddingSwitch");
const paddingState = $("#paddingState");
const processBtn = $("#processBtn");
const processBtnText = $("#processBtn .btn-text");
const countPill = $("#countPill");
const clearAllBtn = $("#clearAllBtn");
const zipProgress = $("#zipProgress");
const zipProgressBar = $("#zipProgress .progress-bar");
const dropzone = $("#dropzone");
const grid = $("#previewContainer");
const dropOverlay = $("#dropOverlay");
const toastsEl = $("#toasts");
const themeBtn = $("#themeBtn");

/* =========================================================
   Стан
   ========================================================= */
let items = [];
let withPadding = true;
let idSeq = 0;
let lastSortEnd = 0;

/* =========================================================
   Іконки (Lucide)
   ========================================================= */
function icon(name, cls = "") {
  const key = name
    .split("-")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
  const node = window.lucide && window.lucide.icons && window.lucide.icons[key];
  if (!node) return "";
  const attrs = (o) =>
    Object.entries(o)
      .map(([k, v]) => `${k}="${v}"`)
      .join(" ");
  const children = node[2].map(([tag, a]) => `<${tag} ${attrs(a)}/>`).join("");
  return `<svg ${attrs(node[1])} class="lucide ${cls}" aria-hidden="true">${children}</svg>`;
}

function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    el.innerHTML = icon(el.dataset.icon);
  });
}

function setIcon(el, name) {
  el.dataset.icon = name;
  el.innerHTML = icon(name);
}

/* =========================================================
   Допоміжні функції
   ========================================================= */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Не вдалося декодувати зображення"));
    img.src = src;
  });
}

function canvasToBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Порожній результат"))),
      type,
      quality
    );
  });
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
}

function imgSize(img) {
  return { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function isTyping(e) {
  const t = e.target;
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
}

/** Якісне зменшення великих зображень (покрокове) */
function drawImageHQ(ctx, img, x, y, w, h) {
  let src = img;
  let { w: sw, h: sh } = imgSize(img);
  while (sw / 2 >= w && sh / 2 >= h && sw > 2) {
    const nw = Math.max(Math.round(sw / 2), Math.ceil(w));
    const nh = Math.max(Math.round(sh / 2), Math.ceil(h));
    const c = document.createElement("canvas");
    c.width = nw;
    c.height = nh;
    const cx = c.getContext("2d");
    cx.imageSmoothingQuality = "high";
    cx.drawImage(src, 0, 0, nw, nh);
    src = c;
    sw = nw;
    sh = nh;
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, x, y, w, h);
}

/**
 * Композиція кадру: білий фон, фото вписане з відступом і ручним зсувом.
 * При size = 1200 це точно та ж формула, що й у вивантаженні.
 */
function renderComposite(ctx, size, img, padding, offset) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);

  const pad = padding ? (OUTPUT_PADDING * size) / OUTPUT_SIZE : 0;
  const maxSize = size - 2 * pad;
  const { w, h } = imgSize(img);
  const scale = Math.min(maxSize / w, maxSize / h);
  const newWidth = w * scale;
  const newHeight = h * scale;
  const x = (size - newWidth) / 2 + ((offset && offset.x) || 0) * size;
  const y = (size - newHeight) / 2 + ((offset && offset.y) || 0) * size;

  drawImageHQ(ctx, img, x, y, newWidth, newHeight);
  ctx.restore();
  return { x, y, w: newWidth, h: newHeight, pad };
}

/* =========================================================
   Назви файлів
   ========================================================= */
function getPrefix() {
  const raw = codeInput.value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
  return raw || DEFAULT_PREFIX;
}

function fileName(index) {
  return `${getPrefix()}_${index + 1}.jpg`;
}

/* =========================================================
   Тости
   ========================================================= */
const supportsPopover = typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype;
if (supportsPopover) toastsEl.popover = "manual";

function bringToTop(el) {
  if (!supportsPopover) return;
  try {
    if (el.matches(":popover-open")) el.hidePopover();
    el.showPopover();
  } catch (e) {}
}

function toast(message, type = "info", duration = 3600) {
  const icons = { success: "check", error: "triangle-alert", warn: "triangle-alert", info: "images" };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(icons[type] || "images")}<div></div>`;
  el.lastElementChild.textContent = message;
  toastsEl.appendChild(el);
  bringToTop(toastsEl);
  setTimeout(() => {
    el.classList.add("hide");
    el.addEventListener("animationend", () => {
      el.remove();
      if (!toastsEl.children.length && supportsPopover) {
        try {
          toastsEl.hidePopover();
        } catch (e) {}
      }
    });
  }, duration);
}

/* =========================================================
   Підказки
   ========================================================= */
const tooltip = document.createElement("div");
tooltip.className = "tooltip";
if (supportsPopover) tooltip.popover = "manual";
document.body.appendChild(tooltip);
let tipTarget = null;

function showTip(target) {
  tipTarget = target;
  tooltip.textContent = target.dataset.tip;
  bringToTop(tooltip);
  const r = target.getBoundingClientRect();
  const tr = tooltip.getBoundingClientRect();
  let top = r.top - tr.height - 8;
  if (top < 8) top = r.bottom + 8;
  const left = clamp(r.left + r.width / 2 - tr.width / 2, 8, window.innerWidth - tr.width - 8);
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
  tooltip.classList.add("show");
}

function hideTip() {
  tipTarget = null;
  tooltip.classList.remove("show");
}

document.addEventListener("pointerover", (e) => {
  if (e.pointerType !== "mouse") return;
  const t = e.target.closest("[data-tip]");
  if (t && t !== tipTarget) showTip(t);
  else if (!t && tipTarget) hideTip();
});
document.addEventListener("pointerdown", hideTip);
window.addEventListener("scroll", hideTip, true);

/* =========================================================
   Діалоги
   ========================================================= */
function openDialog(dialog) {
  hideTip();
  if (!dialog.open) dialog.showModal();
}

document.addEventListener("click", (e) => {
  const closer = e.target.closest("[data-close]");
  if (closer) {
    const dialog = closer.closest("dialog");
    if (dialog) dialog.close();
  }
});

// Клік по фону закриває лише перегляд і довідку
["#lightbox", "#helpModal"].forEach((sel) => {
  const d = $(sel);
  d.addEventListener("click", (e) => {
    if (e.target === d) d.close();
  });
});

const confirmModal = $("#confirmModal");
function confirmAction({ title = "Підтвердження", text = "", ok = "Так", danger = true } = {}) {
  return new Promise((resolve) => {
    $("#confirmTitle").textContent = title;
    $("#confirmText").textContent = text;
    const okBtn = $("#confirmOk");
    okBtn.textContent = ok;
    okBtn.className = `btn ${danger ? "danger" : "primary"}`;
    let result = false;
    const onOk = () => {
      result = true;
      confirmModal.close();
    };
    const onCancel = () => confirmModal.close();
    const onClose = () => {
      okBtn.removeEventListener("click", onOk);
      $("#confirmCancel").removeEventListener("click", onCancel);
      resolve(result);
    };
    okBtn.addEventListener("click", onOk);
    $("#confirmCancel").addEventListener("click", onCancel);
    confirmModal.addEventListener("close", onClose, { once: true });
    openDialog(confirmModal);
    okBtn.focus();
  });
}

/* =========================================================
   Тема
   ========================================================= */
function currentTheme() {
  const set = document.documentElement.dataset.theme;
  if (set) return set;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function syncThemeIcon() {
  setIcon(themeBtn.firstElementChild, currentTheme() === "light" ? "moon" : "sun");
}

themeBtn.addEventListener("click", () => {
  const next = currentTheme() === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch (e) {}
  syncThemeIcon();
});

$("#helpBtn").addEventListener("click", () => openDialog($("#helpModal")));

/* =========================================================
   Модель фото
   ========================================================= */
const addTile = document.createElement("label");
addTile.className = "add-tile";
addTile.htmlFor = "imageInput";
addTile.innerHTML = `${icon("plus")}<span>Додати ще</span>`;

function getItem(id) {
  return items.find((it) => it.id === Number(id));
}

async function setItemBlob(item, blob) {
  const url = URL.createObjectURL(blob);
  let img;
  try {
    img = await loadImage(url);
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  if (item.url) URL.revokeObjectURL(item.url);
  item.blob = blob;
  item.url = url;
  item.img = img;
}

function isImageFile(f) {
  return (
    f &&
    ((f.type && f.type.startsWith("image/")) ||
      /\.(jpe?g|png|webp|gif|bmp|avif|tiff?|heic|heif)$/i.test(f.name || ""))
  );
}

function addFiles(fileList) {
  const files = Array.from(fileList || []);
  const images = files.filter(isImageFile);
  if (files.length && images.length < files.length) {
    toast(`Пропущено файлів, що не є зображеннями: ${files.length - images.length}`, "warn");
  }
  if (!images.length) return;

  images.forEach((file) => {
    const item = {
      id: ++idSeq,
      name: file.name || "clipboard.png",
      original: file,
      blob: null,
      url: null,
      img: null,
      padding: withPadding,
      offset: { x: 0, y: 0 },
      ops: [],
      history: [],
      busy: false,
      el: null
    };
    items.push(item);
    createCard(item);
    setBusy(item, true, "Завантаження…");
    setItemBlob(item, file)
      .then(() => {
        setBusy(item, false);
        refreshCard(item);
      })
      .catch(() => {
        removeItem(item);
        toast(`Не вдалося відкрити «${item.name}». Браузер не підтримує цей формат.`, "error", 5000);
      });
  });
  updateUI();
}

function removeItem(item) {
  const index = items.indexOf(item);
  if (index === -1) return;
  items.splice(index, 1);
  if (item.url) URL.revokeObjectURL(item.url);
  item.el && item.el.remove();
  updateUI();
}

function snapshot(item) {
  return { blob: item.blob, offset: { ...item.offset }, ops: [...item.ops] };
}

function pushHistory(item) {
  item.history.push(snapshot(item));
  if (item.history.length > HISTORY_LIMIT) item.history.shift();
}

/** Застосувати результат інструмента до фото (з можливістю відміни) */
async function commit(item, { blob, offset, op }) {
  const snap = snapshot(item);
  if (blob) await setItemBlob(item, blob);
  if (offset) item.offset = { ...offset };
  item.history.push(snap);
  if (item.history.length > HISTORY_LIMIT) item.history.shift();
  if (op) item.ops.push(op);
  refreshCard(item);
}

async function undoItem(item) {
  const snap = item.history.pop();
  if (!snap) return;
  try {
    if (snap.blob !== item.blob) await setItemBlob(item, snap.blob);
    item.offset = snap.offset;
    item.ops = snap.ops;
    refreshCard(item);
  } catch (e) {
    toast("Не вдалося відмінити дію", "error");
  }
}

async function resetItem(item) {
  if (isPristine(item)) return;
  try {
    pushHistory(item);
    if (item.blob !== item.original) await setItemBlob(item, item.original);
    item.offset = { x: 0, y: 0 };
    item.ops = [];
    refreshCard(item);
    toast("Повернуто оригінал. Це можна відмінити", "info");
  } catch (e) {
    toast("Не вдалося повернути оригінал", "error");
  }
}

function isPristine(item) {
  return item.blob === item.original && !item.offset.x && !item.offset.y && !item.ops.length;
}

/* =========================================================
   Картки
   ========================================================= */
function createCard(item) {
  const card = document.createElement("article");
  card.className = "card";
  card.dataset.id = item.id;
  card.innerHTML = `
    <div class="card-media" data-act="view">
      <canvas width="${THUMB_SIZE}" height="${THUMB_SIZE}"></canvas>
      <span class="card-num"></span>
      <button class="card-overlay-btn card-zoom" data-act="view" data-tip="Переглянути результат" aria-label="Переглянути">${icon("maximize")}</button>
      <button class="card-overlay-btn card-delete" data-act="delete" data-tip="Видалити фото" aria-label="Видалити">${icon("x")}</button>
      <div class="card-tags"></div>
      <div class="card-busy">${icon("loader-circle", "spin")}<span class="busy-text"></span></div>
    </div>
    <div class="card-info">
      <div class="card-name"></div>
      <div class="card-meta"></div>
    </div>
    <div class="card-tools">
      <button class="icon-btn" data-act="crop" data-tip="Обрізати" aria-label="Обрізати">${icon("crop")}</button>
      <button class="icon-btn" data-act="transform" data-tip="Поворот / віддзеркалення" aria-label="Поворот">${icon("rotate-cw")}</button>
      <button class="icon-btn" data-act="center" data-tip="Ручне центрування" aria-label="Центрування">${icon("move")}</button>
      <button class="icon-btn" data-act="pen" data-tip="Перо: обвести об'єкт" aria-label="Перо">${icon("pen-tool")}</button>
      <button class="icon-btn" data-act="bg" data-tip="Видалити фон" aria-label="Видалити фон">${icon("wand-sparkles")}</button>
    </div>
    <div class="card-foot">
      <label class="switch-row compact" data-tip="Відступ 50 px для цього фото">
        <input type="checkbox" data-act="padding">
        <span class="switch"></span>
        <span class="switch-label">Відступ</span>
      </label>
      <button class="icon-btn ghost" data-act="undo" data-tip="Відмінити останню дію" aria-label="Відмінити">${icon("undo-2")}</button>
      <button class="icon-btn ghost" data-act="reset" data-tip="Повернути оригінал" aria-label="Оригінал">${icon("rotate-ccw-square")}</button>
      <button class="icon-btn ghost" data-act="download" data-tip="Скачати цей JPG" aria-label="Скачати">${icon("download")}</button>
    </div>`;
  item.el = card;
  item.canvas = card.querySelector("canvas");
  card.querySelector('[data-act="padding"]').checked = item.padding;
  grid.insertBefore(card, addTile.parentNode === grid ? addTile : null);
}

function setBusy(item, busy, text = "") {
  item.busy = busy;
  if (!item.el) return;
  item.el.classList.toggle("busy", busy);
  item.el.querySelector(".busy-text").textContent = text;
  item.el
    .querySelectorAll(".card-tools button, .card-foot button, .card-foot input")
    .forEach((b) => (b.disabled = busy));
  if (!busy) refreshCard(item);
}

function refreshCard(item) {
  if (!item.el || !item.img) return;
  const ctx = item.canvas.getContext("2d");
  renderComposite(ctx, THUMB_SIZE, item.img, item.padding, item.offset);

  const { w, h } = imgSize(item.img);
  const meta = item.el.querySelector(".card-meta");
  meta.textContent = `${w}×${h} · ${item.name}`;
  meta.title = item.name;
  if (Math.max(w, h) < LOW_RES_WARNING) {
    const warn = document.createElement("span");
    warn.className = "warn-text";
    warn.textContent = "Мала роздільність · ";
    meta.prepend(warn);
  }

  const tags = item.el.querySelector(".card-tags");
  tags.innerHTML = "";
  [...new Set(item.ops)].forEach((op) => {
    const t = document.createElement("span");
    t.className = "tag";
    t.textContent = OP_LABELS[op] || op;
    tags.appendChild(t);
  });
  if (!item.padding) {
    const t = document.createElement("span");
    t.className = "tag";
    t.textContent = "Без відступу";
    tags.appendChild(t);
  }

  Object.keys(OP_LABELS).forEach((op) => {
    const btn = item.el.querySelector(`.card-tools [data-act="${op}"]`);
    if (btn) btn.classList.toggle("applied", item.ops.includes(op));
  });

  if (!item.busy) {
    item.el.querySelector('[data-act="undo"]').disabled = !item.history.length;
    item.el.querySelector('[data-act="reset"]').disabled = isPristine(item);
  }
  item.el.querySelector('[data-act="padding"]').checked = item.padding;
}

function updateNumbers() {
  items.forEach((item, i) => {
    if (!item.el) return;
    item.el.querySelector(".card-num").textContent = i + 1;
    item.el.querySelector(".card-name").textContent = fileName(i);
  });
  const p = getPrefix();
  namePreview.textContent =
    items.length > 1 ? `${p}_1.jpg … ${p}_${items.length}.jpg` : `${p}_1.jpg`;
  namePreview.title = `Архів: ${p}_images.zip`;
}

function updateGlobalPaddingState() {
  const on = items.filter((it) => it.padding).length;
  const mixed = items.length && on > 0 && on < items.length;
  paddingSwitch.indeterminate = !!mixed;
  if (!mixed && items.length) {
    withPadding = on === items.length;
    paddingSwitch.checked = withPadding;
  }
  paddingState.textContent = mixed
    ? `з відступом ${on} з ${items.length}`
    : paddingSwitch.checked
    ? "усі з відступом 50 px"
    : "усі без відступів";
}

function updateUI() {
  const has = items.length > 0;
  dropzone.hidden = has;
  grid.hidden = !has;
  if (has && addTile.parentNode !== grid) grid.appendChild(addTile);
  if (!has && addTile.parentNode) addTile.remove();
  countPill.textContent = items.length;
  processBtn.disabled = !has;
  clearAllBtn.disabled = !has;
  updateNumbers();
  updateGlobalPaddingState();
}

/* Дії на картках */
grid.addEventListener("click", (e) => {
  const actEl = e.target.closest("[data-act]");
  const card = e.target.closest(".card");
  if (!actEl || !card) return;
  const item = getItem(card.dataset.id);
  if (!item) return;
  const act = actEl.dataset.act;
  if (act === "padding") return;

  if (act === "delete") {
    e.stopPropagation();
    confirmAction({ title: "Видалити фото?", text: "Видалити це зображення?", ok: "Видалити" }).then(
      (ok) => ok && removeItem(item)
    );
    return;
  }
  if (!item.img || item.busy) return;

  switch (act) {
    case "view":
      if (Date.now() - lastSortEnd < 300) return;
      openLightbox(items.indexOf(item));
      break;
    case "crop":
      openCropModal(item);
      break;
    case "transform":
      openTransformModal(item);
      break;
    case "center":
      openManualCenteringModal(item);
      break;
    case "pen":
      openPenModeModal(item);
      break;
    case "bg":
      handleRemoveBackground(item);
      break;
    case "undo":
      undoItem(item);
      break;
    case "reset":
      resetItem(item);
      break;
    case "download":
      downloadSingle(item);
      break;
  }
});

grid.addEventListener("change", (e) => {
  if (e.target.dataset.act !== "padding") return;
  const item = getItem(e.target.closest(".card").dataset.id);
  if (!item) return;
  item.padding = e.target.checked;
  refreshCard(item);
  updateGlobalPaddingState();
});

/* Перетягування для зміни порядку */
if (window.Sortable) {
  Sortable.create(grid, {
    animation: 180,
    draggable: ".card",
    handle: ".card-media",
    filter: ".card-overlay-btn",
    preventOnFilter: false,
    delayOnTouchOnly: true,
    delay: 180,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    dragClass: "sortable-drag",
    onStart: hideTip,
    onEnd: () => {
      lastSortEnd = Date.now();
      const order = [...grid.querySelectorAll(".card")].map((el) => getItem(el.dataset.id));
      items = order.filter(Boolean);
      grid.appendChild(addTile);
      updateNumbers();
    }
  });
}

/* =========================================================
   Завантаження файлів
   ========================================================= */
imageInput.addEventListener("change", () => {
  addFiles(imageInput.files);
  imageInput.value = "";
});

let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files");
const anyDialogOpen = () => !!document.querySelector("dialog[open]");

window.addEventListener("dragenter", (e) => {
  if (!hasFiles(e) || anyDialogOpen()) return;
  dragDepth++;
  dropOverlay.classList.add("show");
});
window.addEventListener("dragleave", (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dropOverlay.classList.remove("show");
});
window.addEventListener("dragover", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = anyDialogOpen() ? "none" : "copy";
});
window.addEventListener("drop", (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove("show");
  if (!anyDialogOpen()) addFiles(e.dataTransfer.files);
});

document.addEventListener("paste", (e) => {
  if (anyDialogOpen() || !e.clipboardData) return;
  const files = Array.from(e.clipboardData.items || [])
    .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
    .map((it) => it.getAsFile())
    .filter(Boolean);
  if (!files.length) return;
  e.preventDefault();
  addFiles(files);
  toast(`Додано з буфера: ${files.length}`, "success");
});

window.addEventListener("beforeunload", (e) => {
  if (items.length) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/* =========================================================
   Верхня панель
   ========================================================= */
codeInput.addEventListener("input", updateNumbers);

paddingSwitch.addEventListener("change", () => {
  paddingSwitch.indeterminate = false;
  withPadding = paddingSwitch.checked;
  items.forEach((item) => {
    item.padding = withPadding;
    refreshCard(item);
  });
  updateGlobalPaddingState();
});

clearAllBtn.addEventListener("click", async () => {
  if (!items.length) return;
  const ok = await confirmAction({
    title: "Очистити все?",
    text: "Ви впевнені, що хочете видалити всі завантажені фото?",
    ok: "Видалити всі"
  });
  if (!ok) return;
  items.forEach((it) => it.url && URL.revokeObjectURL(it.url));
  items.forEach((it) => it.el && it.el.remove());
  items = [];
  imageInput.value = "";
  updateUI();
});

/* =========================================================
   Вивантаження
   ========================================================= */
function exportItem(item) {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  renderComposite(canvas.getContext("2d"), OUTPUT_SIZE, item.img, item.padding, item.offset);
  return canvasToBlob(canvas, "image/jpeg", OUTPUT_QUALITY);
}

async function downloadSingle(item) {
  try {
    const blob = await exportItem(item);
    downloadBlob(blob, fileName(items.indexOf(item)));
  } catch (e) {
    toast("Не вдалося сформувати JPG", "error");
  }
}

function setZipProgress(fraction, text) {
  if (fraction === null) {
    zipProgress.hidden = true;
    zipProgressBar.style.width = "0";
    processBtnText.textContent = "Скачати ZIP";
    return;
  }
  zipProgress.hidden = false;
  zipProgressBar.style.width = `${Math.round(fraction * 100)}%`;
  if (text) processBtnText.textContent = text;
}

processBtn.addEventListener("click", async () => {
  if (!items.length) {
    toast("Будь ласка, завантажте зображення для обробки.", "warn");
    return;
  }
  if (items.some((it) => it.busy || !it.img)) {
    toast("Зачекайте, доки всі фото обробляться", "warn");
    return;
  }

  const zip = new JSZip();
  const prefix = getPrefix();
  const list = [...items];
  processBtn.disabled = true;
  clearAllBtn.disabled = true;

  try {
    for (let i = 0; i < list.length; i++) {
      setZipProgress((i / list.length) * 0.85, `Обробка ${i + 1}/${list.length}…`);
      const blob = await exportItem(list[i]);
      zip.file(`${prefix}_${i + 1}.jpg`, blob);
    }
    setZipProgress(0.85, "Пакування…");
    const content = await zip.generateAsync({ type: "blob" }, (meta) =>
      setZipProgress(0.85 + (meta.percent / 100) * 0.15)
    );
    downloadBlob(content, `${prefix}_images.zip`);
    toast("ZIP-архів успішно сформовано та завантажено!", "success");
  } catch (err) {
    console.error("Error generating ZIP:", err);
    toast("Помилка при формуванні ZIP-архіву.", "error");
  } finally {
    setZipProgress(null);
    processBtn.disabled = !items.length;
    clearAllBtn.disabled = !items.length;
  }
});

/* =========================================================
   Перегляд результату
   ========================================================= */
const lightbox = $("#lightbox");
const lightboxCanvas = $("#lightboxCanvas");
let lbIndex = 0;

function openLightbox(index) {
  lbIndex = index;
  renderLightbox();
  openDialog(lightbox);
}

function renderLightbox() {
  const item = items[lbIndex];
  if (!item || !item.img) return;
  renderComposite(lightboxCanvas.getContext("2d"), OUTPUT_SIZE, item.img, item.padding, item.offset);
  $("#lightboxTitle").textContent = fileName(lbIndex);
  $("#lightboxMeta").textContent = `${lbIndex + 1} з ${items.length}`;
  $("#lbPrev").disabled = lbIndex <= 0;
  $("#lbNext").disabled = lbIndex >= items.length - 1;
}

function lightboxStep(d) {
  const next = clamp(lbIndex + d, 0, items.length - 1);
  if (next !== lbIndex) {
    lbIndex = next;
    renderLightbox();
  }
}

$("#lbPrev").addEventListener("click", () => lightboxStep(-1));
$("#lbNext").addEventListener("click", () => lightboxStep(1));
$("#lbDownload").addEventListener("click", () => items[lbIndex] && downloadSingle(items[lbIndex]));
lightbox.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") lightboxStep(-1);
  if (e.key === "ArrowRight") lightboxStep(1);
});

/* =========================================================
   Обрізка
   ========================================================= */
const cropModal = $("#cropModal");
const cropImage = $("#cropImage");
const saveCropBtn = $("#saveCropBtn");
const cropInfo = $("#cropInfo");
let cropper = null;
let currentCropObj = null;
let cropRatio = NaN;

/** Скільки білих смуг буде у файлі при такому розмірі обрізки */
function updateCropInfo(w, h) {
  w = Math.round(w);
  h = Math.round(h);
  if (!currentCropObj || !w || !h) {
    cropInfo.textContent = "";
    return;
  }
  const pad = currentCropObj.padding ? OUTPUT_PADDING : 0;
  const maxSize = OUTPUT_SIZE - 2 * pad;
  const scale = Math.min(maxSize / w, maxSize / h);
  const stripeX = Math.round((maxSize - w * scale) / 2);
  const stripeY = Math.round((maxSize - h * scale) / 2);
  let text = `${w}×${h}`;
  let cls = "";
  if (stripeY >= 1) {
    text += ` · білі смуги зверху і знизу ≈${stripeY} px. Оберіть 1:1, щоб прибрати`;
    cls = "warn";
  } else if (stripeX >= 1) {
    text += ` · білі смуги зліва і справа ≈${stripeX} px. Оберіть 1:1, щоб прибрати`;
    cls = "warn";
  } else {
    text += pad ? " · квадрат, лише відступ 50 px" : " · квадрат, заповнить весь кадр";
    cls = "ok";
  }
  cropInfo.textContent = text;
  cropInfo.className = `crop-info ${cls}`;
}

async function openCropModal(obj) {
  currentCropObj = obj;
  document
    .querySelectorAll("#cropRatios .chip")
    .forEach((c) => c.classList.toggle("active", Number(c.dataset.ratio) === cropRatio || (isNaN(cropRatio) && c.dataset.ratio === "NaN")));
  cropInfo.textContent = "";
  openDialog(cropModal);
  cropImage.src = obj.url;
  try {
    await cropImage.decode();
  } catch (e) {}
  if (!cropModal.open || currentCropObj !== obj) return;
  if (cropper) cropper.destroy();
  cropper = new Cropper(cropImage, {
    viewMode: 1,
    autoCropArea: 1,
    aspectRatio: cropRatio,
    checkOrientation: false,
    responsive: true,
    background: true,
    crop: (e) => updateCropInfo(e.detail.width, e.detail.height)
  });
}

function closeCropModal() {
  cropModal.close();
}

cropModal.addEventListener("close", () => {
  if (cropper) cropper.destroy();
  cropper = null;
  currentCropObj = null;
});

$("#cropRatios").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (!chip || !cropper) return;
  document.querySelectorAll("#cropRatios .chip").forEach((c) => c.classList.toggle("active", c === chip));
  cropRatio = Number(chip.dataset.ratio);
  cropper.setAspectRatio(cropRatio);
});

saveCropBtn.addEventListener("click", async () => {
  if (!cropper || !currentCropObj) return;
  const obj = currentCropObj;
  const canvas = cropper.getCroppedCanvas({ imageSmoothingQuality: "high" });
  if (!canvas) return;
  try {
    const blob = await canvasToBlob(canvas, "image/png");
    await commit(obj, { blob, op: "crop" });
    closeCropModal();
  } catch (e) {
    toast("Не вдалося зберегти обрізку", "error");
  }
});

/* =========================================================
   Поворот / віддзеркалення
   ========================================================= */
const transformModal = $("#transformModal");
const transformCanvas = $("#transformCanvas");
let currentTransformObj = null;
let transformState = { rotation: 0, flipX: false, flipY: false };

function openTransformModal(obj) {
  currentTransformObj = obj;
  transformState = { rotation: 0, flipX: false, flipY: false };
  openDialog(transformModal);
  requestAnimationFrame(drawTransformPreview);
}

function closeTransformModal() {
  transformModal.close();
}

function drawTransformPreview() {
  if (!currentTransformObj) return;
  const img = currentTransformObj.img;
  const dpr = window.devicePixelRatio || 1;
  const size = Math.round((transformCanvas.clientWidth || 400) * dpr);
  transformCanvas.width = size;
  transformCanvas.height = size;
  const ctx = transformCanvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);

  const { w, h } = imgSize(img);
  const rotated = transformState.rotation % 180 !== 0;
  const rw = rotated ? h : w;
  const rh = rotated ? w : h;
  const s = Math.min(size / rw, size / rh) * 0.9;

  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate((transformState.rotation * Math.PI) / 180);
  ctx.scale(transformState.flipX ? -1 : 1, transformState.flipY ? -1 : 1);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, (-w * s) / 2, (-h * s) / 2, w * s, h * s);
  ctx.restore();
}

$("#rotateLeftBtn").addEventListener("click", () => {
  transformState.rotation = (transformState.rotation - 90 + 360) % 360;
  drawTransformPreview();
});
$("#rotateRightBtn").addEventListener("click", () => {
  transformState.rotation = (transformState.rotation + 90) % 360;
  drawTransformPreview();
});
$("#flipXBtn").addEventListener("click", () => {
  transformState.flipX = !transformState.flipX;
  drawTransformPreview();
});
$("#flipYBtn").addEventListener("click", () => {
  transformState.flipY = !transformState.flipY;
  drawTransformPreview();
});

$("#saveTransformBtn").addEventListener("click", async () => {
  const obj = currentTransformObj;
  if (!obj) return;
  const st = transformState;
  if (st.rotation === 0 && !st.flipX && !st.flipY) {
    closeTransformModal();
    return;
  }
  const img = obj.img;
  const { w, h } = imgSize(img);
  const rotated = st.rotation % 180 !== 0;
  const c = document.createElement("canvas");
  c.width = rotated ? h : w;
  c.height = rotated ? w : h;
  const ctx = c.getContext("2d");
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((st.rotation * Math.PI) / 180);
  ctx.scale(st.flipX ? -1 : 1, st.flipY ? -1 : 1);
  ctx.drawImage(img, -w / 2, -h / 2);
  try {
    const blob = await canvasToBlob(c, "image/png");
    await commit(obj, { blob, op: "transform" });
    closeTransformModal();
  } catch (e) {
    toast("Не вдалося застосувати поворот", "error");
  }
});

transformModal.addEventListener("close", () => (currentTransformObj = null));

/* =========================================================
   Ручне центрування
   ========================================================= */
const manualCenteringModal = $("#manualCenteringModal");
const manualCenteringCanvas = $("#manualCenteringCanvas");
const offsetReadout = $("#offsetReadout");
const centerPaddingSwitch = $("#centerPaddingSwitch");
let manualCenteringCurrentObj = null;
let centerOffset = { x: 0, y: 0 };
let centerPadding = true;
let centerDrag = null;

function openManualCenteringModal(obj) {
  manualCenteringCurrentObj = obj;
  centerOffset = { ...obj.offset };
  centerPadding = obj.padding;
  centerPaddingSwitch.checked = centerPadding;
  openDialog(manualCenteringModal);
  requestAnimationFrame(() => {
    drawManualCenteringCanvas();
    manualCenteringCanvas.focus();
  });
}

function drawManualCenteringCanvas() {
  const obj = manualCenteringCurrentObj;
  if (!obj) return;
  const dpr = window.devicePixelRatio || 1;
  const size = Math.round((manualCenteringCanvas.clientWidth || 400) * dpr);
  if (manualCenteringCanvas.width !== size) {
    manualCenteringCanvas.width = size;
    manualCenteringCanvas.height = size;
  }
  const ctx = manualCenteringCanvas.getContext("2d");
  const box = renderComposite(ctx, size, obj.img, centerPadding, centerOffset);

  // Сітка
  ctx.save();
  ctx.lineWidth = Math.max(1, dpr);
  ctx.strokeStyle = "rgba(100, 116, 139, 0.22)";
  const step = size / 8;
  for (let i = 1; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }

  // Межі відступу
  if (box.pad) {
    ctx.setLineDash([6 * dpr, 5 * dpr]);
    ctx.strokeStyle = "rgba(32, 201, 151, 0.8)";
    ctx.strokeRect(box.pad, box.pad, size - 2 * box.pad, size - 2 * box.pad);
    ctx.setLineDash([]);
  }

  // Рамка фото
  ctx.strokeStyle = "rgba(37, 99, 235, 0.75)";
  ctx.strokeRect(box.x, box.y, box.w, box.h);

  // Центр
  const centered = !centerOffset.x && !centerOffset.y;
  ctx.strokeStyle = centered ? "rgba(32, 201, 151, 0.9)" : "rgba(239, 68, 68, 0.65)";
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath();
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();
  ctx.restore();

  const px = (v) => {
    const n = Math.round(v * OUTPUT_SIZE);
    return n > 0 ? `+${n}` : `${n}`;
  };
  offsetReadout.textContent = centered ? "По центру" : `X ${px(centerOffset.x)} · Y ${px(centerOffset.y)} px`;
}

function setCenterOffset(x, y) {
  const snap = 5 / OUTPUT_SIZE;
  centerOffset = {
    x: clamp(Math.abs(x) < snap ? 0 : x, -0.5, 0.5),
    y: clamp(Math.abs(y) < snap ? 0 : y, -0.5, 0.5)
  };
  drawManualCenteringCanvas();
}

manualCenteringCanvas.addEventListener("pointerdown", (e) => {
  manualCenteringCanvas.setPointerCapture(e.pointerId);
  centerDrag = { sx: e.clientX, sy: e.clientY, ox: centerOffset.x, oy: centerOffset.y };
  manualCenteringCanvas.classList.add("dragging");
});
manualCenteringCanvas.addEventListener("pointermove", (e) => {
  if (!centerDrag) return;
  const w = manualCenteringCanvas.clientWidth;
  setCenterOffset(
    centerDrag.ox + (e.clientX - centerDrag.sx) / w,
    centerDrag.oy + (e.clientY - centerDrag.sy) / w
  );
});
const endCenterDrag = () => {
  centerDrag = null;
  manualCenteringCanvas.classList.remove("dragging");
};
manualCenteringCanvas.addEventListener("pointerup", endCenterDrag);
manualCenteringCanvas.addEventListener("pointercancel", endCenterDrag);

manualCenteringModal.addEventListener("keydown", (e) => {
  const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (!dirs[e.key] || isTyping(e)) return;
  e.preventDefault();
  const step = (e.shiftKey ? 10 : 1) / OUTPUT_SIZE;
  const [dx, dy] = dirs[e.key];
  // Без «прилипання» при точному зсуві з клавіатури
  centerOffset = {
    x: clamp(centerOffset.x + dx * step, -0.5, 0.5),
    y: clamp(centerOffset.y + dy * step, -0.5, 0.5)
  };
  drawManualCenteringCanvas();
});

$("#centerResetBtn").addEventListener("click", () => setCenterOffset(0, 0));
centerPaddingSwitch.addEventListener("change", () => {
  centerPadding = centerPaddingSwitch.checked;
  drawManualCenteringCanvas();
});

$("#manualCenteringSaveBtn").addEventListener("click", async () => {
  const obj = manualCenteringCurrentObj;
  if (!obj) return;
  const changedOffset = centerOffset.x !== obj.offset.x || centerOffset.y !== obj.offset.y;
  if (centerPadding !== obj.padding) {
    obj.padding = centerPadding;
    updateGlobalPaddingState();
  }
  if (changedOffset) await commit(obj, { offset: centerOffset, op: "center" });
  else refreshCard(obj);
  manualCenteringModal.close();
});
$("#manualCenteringCancelBtn").addEventListener("click", () => manualCenteringModal.close());
manualCenteringModal.addEventListener("close", () => (manualCenteringCurrentObj = null));

/* =========================================================
   Видалення фону (remove.bg)
   ========================================================= */
const pinModal = $("#pinModal");
const pinInput = $("#pinInput");
const pinError = $("#pinError");
let currentRemoveBgObj = null;
let pinVerified = false;

function handleRemoveBackground(obj) {
  currentRemoveBgObj = obj;
  pinInput.value = "";
  pinError.hidden = true;
  pinInput.hidden = pinVerified;
  pinModal.querySelector("p.muted").textContent = pinVerified
    ? "Фон буде видалено автоматично через remove.bg."
    : "Введіть PIN-код для видалення фону";
  openDialog(pinModal);
  (pinVerified ? $("#pinSubmitBtn") : pinInput).focus();
}

$("#pinForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!pinVerified) {
    if (pinInput.value.trim() !== REMOVE_BG_PIN) {
      pinError.hidden = false;
      pinInput.classList.remove("shake");
      void pinInput.offsetWidth;
      pinInput.classList.add("shake");
      pinInput.value = "";
      pinInput.focus();
      return;
    }
    pinVerified = true;
  }
  const obj = currentRemoveBgObj;
  pinModal.close();
  if (obj) processRemoveBackground(obj, $("#bgTrimCheck").checked);
});

$("#pinCancelBtn").addEventListener("click", () => pinModal.close());
pinModal.addEventListener("close", () => (currentRemoveBgObj = null));
pinInput.addEventListener("input", () => (pinError.hidden = true));

async function processRemoveBackground(obj, trim) {
  setBusy(obj, true, "Видалення фону…");
  try {
    const formData = new FormData();
    formData.append("image_file", obj.blob, "image.png");
    formData.append("size", "auto");
    if (trim) formData.append("crop", "true");

    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": REMOVE_BG_API_KEY },
      body: formData
    });
    if (!res.ok) {
      let msg = `Помилка remove.bg (${res.status})`;
      try {
        const data = await res.json();
        if (data.errors && data.errors[0]) msg += `: ${data.errors[0].title}`;
      } catch (e) {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    if (!items.includes(obj)) return;
    await commit(obj, { blob, op: "bg" });
    toast("Фон видалено", "success");
  } catch (err) {
    console.error("remove.bg error:", err);
    toast(err.message || "Помилка видалення фону", "error", 6000);
  } finally {
    setBusy(obj, false);
  }
}

/* =========================================================
   Перо
   ========================================================= */
const penModeModal = $("#penModeModal");
const penStage = $("#penStage");
const penCanvas = $("#penCanvas");
const penCtx = penCanvas.getContext("2d");
const penHint = $("#penHint");
const zoomFitBtn = $("#zoomFitBtn");
const panModeBtn = $("#panModeBtn");

const POINT_HIT_RADIUS = 11;
const pen = {
  obj: null,
  img: null,
  iw: 0,
  ih: 0,
  points: [],
  closed: false,
  history: [],
  scale: 1,
  fit: 1,
  ox: 0,
  oy: 0,
  w: 0,
  h: 0,
  dpr: 1,
  userMoved: false,
  mouse: { x: 0, y: 0, inside: false },
  hover: -1,
  drag: null,
  pending: null,
  pointers: new Map(),
  pinch: null,
  spaceHeld: false,
  panMode: false
};

function openPenModeModal(obj) {
  Object.assign(pen, {
    obj,
    img: obj.img,
    points: [],
    closed: false,
    history: [],
    drag: null,
    pending: null,
    pinch: null,
    hover: -1,
    userMoved: false,
    panMode: false
  });
  pen.pointers.clear();
  const { w, h } = imgSize(obj.img);
  pen.iw = w;
  pen.ih = h;
  panModeBtn.classList.remove("active");
  openDialog(penModeModal);
  requestAnimationFrame(() => {
    resizePenCanvas();
    fitPen();
    drawPenCanvas();
  });
}

function resizePenCanvas() {
  const rect = penStage.getBoundingClientRect();
  pen.dpr = window.devicePixelRatio || 1;
  pen.w = rect.width;
  pen.h = rect.height;
  penCanvas.width = Math.max(1, Math.round(rect.width * pen.dpr));
  penCanvas.height = Math.max(1, Math.round(rect.height * pen.dpr));
}

function fitPen() {
  pen.fit = Math.min(pen.w / pen.iw, pen.h / pen.ih) * 0.92 || 1;
  pen.scale = pen.fit;
  pen.ox = (pen.w - pen.iw * pen.scale) / 2;
  pen.oy = (pen.h - pen.ih * pen.scale) / 2;
  pen.userMoved = false;
}

function zoomPenAt(factor, cx = pen.w / 2, cy = pen.h / 2) {
  const max = Math.max(pen.fit * 16, 4);
  const next = clamp(pen.scale * factor, pen.fit * 0.5, max);
  const ix = (cx - pen.ox) / pen.scale;
  const iy = (cy - pen.oy) / pen.scale;
  pen.scale = next;
  pen.ox = cx - ix * next;
  pen.oy = cy - iy * next;
  pen.userMoved = true;
  drawPenCanvas();
}

const toScreen = (p) => ({ x: p.x * pen.scale + pen.ox, y: p.y * pen.scale + pen.oy });
const toImage = (x, y) => ({
  x: clamp((x - pen.ox) / pen.scale, 0, pen.iw),
  y: clamp((y - pen.oy) / pen.scale, 0, pen.ih)
});

function hitPoint(x, y, radius = POINT_HIT_RADIUS) {
  let best = -1;
  let bestD = radius;
  pen.points.forEach((p, i) => {
    const s = toScreen(p);
    const d = Math.hypot(s.x - x, s.y - y);
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

function pushPenHistory() {
  pen.history.push({ points: pen.points.map((p) => ({ ...p })), closed: pen.closed });
  if (pen.history.length > 300) pen.history.shift();
}

function undoLastPenPoint() {
  if (!penModeModal.open) return;
  const prev = pen.history.pop();
  if (!prev) {
    toast("Немає кроків для відміни", "info", 1800);
    return;
  }
  pen.points = prev.points;
  pen.closed = prev.closed;
  drawPenCanvas();
}

function closePenPath() {
  if (pen.closed) return;
  if (pen.points.length < 3) {
    toast("Для контуру потрібно щонайменше 3 точки", "warn");
    return;
  }
  pushPenHistory();
  pen.closed = true;
  drawPenCanvas();
}

function updatePenHint() {
  const n = pen.points.length;
  penHint.textContent = pen.closed
    ? "Контур замкнено. Підправте точки або натисніть «Зберегти обведення»"
    : n === 0
    ? "Клікайте по краю об'єкта, щоб ставити точки"
    : n < 3
    ? `Точок: ${n}. Продовжуйте обводити`
    : `Точок: ${n}. Клікніть на першу точку або натисніть Enter, щоб замкнути контур`;
  zoomFitBtn.textContent = `${Math.round(pen.scale * 100)}%`;
}

function drawPenCanvas() {
  if (!pen.img) return;
  const ctx = penCtx;
  ctx.setTransform(pen.dpr, 0, 0, pen.dpr, 0, 0);
  ctx.clearRect(0, 0, pen.w, pen.h);

  ctx.imageSmoothingEnabled = pen.scale < 2;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(pen.img, pen.ox, pen.oy, pen.iw * pen.scale, pen.ih * pen.scale);

  ctx.strokeStyle = "rgba(100, 116, 139, 0.5)";
  ctx.lineWidth = 1;
  ctx.strokeRect(pen.ox - 0.5, pen.oy - 0.5, pen.iw * pen.scale + 1, pen.ih * pen.scale + 1);

  const pts = pen.points.map(toScreen);
  if (pts.length) {
    // Затемнення поза контуром
    if (pen.closed) {
      ctx.beginPath();
      ctx.rect(0, 0, pen.w, pen.h);
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = "rgba(8, 12, 20, 0.55)";
      ctx.fill("evenodd");
    }

    const tracePath = () => {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      pts.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
      if (pen.closed) ctx.closePath();
    };
    ctx.lineJoin = "round";
    tracePath();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
    ctx.lineWidth = 3.5;
    ctx.stroke();
    tracePath();
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 1.75;
    ctx.stroke();

    // Лінія до курсора
    const canClose = !pen.closed && pts.length >= 3 && pen.hover === 0;
    if (!pen.closed && pen.mouse.inside && !pen.drag && !pen.spaceHeld && !pen.panMode) {
      const last = pts[pts.length - 1];
      const target = canClose ? pts[0] : pen.mouse;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(target.x, target.y);
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = "#22d3ee";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Точки
    pts.forEach((p, i) => {
      const isFirst = i === 0;
      const hovered = i === pen.hover;
      let r = hovered ? 6.5 : 4.5;
      if (isFirst && !pen.closed && pts.length >= 3) r = hovered ? 9 : 6.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isFirst && canClose ? "#20c997" : "#ffffff";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = isFirst && !pen.closed ? "#20c997" : "#0891b2";
      ctx.stroke();
    });
  }
  updatePenHint();
}

function penPos(e) {
  const r = penCanvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function setPenCursor() {
  penCanvas.classList.toggle("panning", pen.drag && pen.drag.type === "pan");
  penCanvas.classList.toggle("pan", pen.spaceHeld || pen.panMode);
  penCanvas.classList.toggle("over-point", pen.hover >= 0 && !pen.spaceHeld && !pen.panMode);
}

penCanvas.addEventListener("pointerdown", (e) => {
  penCanvas.setPointerCapture(e.pointerId);
  const p = penPos(e);
  pen.pointers.set(e.pointerId, p);

  if (pen.pointers.size === 2) {
    const [a, b] = [...pen.pointers.values()];
    pen.pending = null;
    pen.drag = null;
    pen.pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      scale: pen.scale,
      ox: pen.ox,
      oy: pen.oy
    };
    return;
  }
  if (pen.pointers.size > 2) return;

  if (e.button === 1 || e.button === 2 || pen.spaceHeld || pen.panMode) {
    e.preventDefault();
    pen.drag = { type: "pan", sx: p.x, sy: p.y, ox: pen.ox, oy: pen.oy };
    setPenCursor();
    return;
  }
  if (e.button !== 0) return;

  const radius = e.pointerType === "touch" ? 20 : POINT_HIT_RADIUS;
  const hit = hitPoint(p.x, p.y, radius);
  if (hit >= 0) {
    if (e.shiftKey || e.altKey) {
      pushPenHistory();
      pen.points.splice(hit, 1);
      if (pen.points.length < 3) pen.closed = false;
      pen.hover = -1;
      drawPenCanvas();
      return;
    }
    pen.drag = { type: "point", index: hit, sx: p.x, sy: p.y, moved: false };
    return;
  }
  pen.pending = { x: p.x, y: p.y, touch: e.pointerType === "touch" };
});

penCanvas.addEventListener("pointermove", (e) => {
  const p = penPos(e);
  if (pen.pointers.has(e.pointerId)) pen.pointers.set(e.pointerId, p);
  pen.mouse = { ...p, inside: true };

  if (pen.pinch && pen.pointers.size === 2) {
    const [a, b] = [...pen.pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const max = Math.max(pen.fit * 16, 4);
    const next = clamp((pen.pinch.scale * dist) / pen.pinch.dist, pen.fit * 0.5, max);
    const ix = (pen.pinch.mid.x - pen.pinch.ox) / pen.pinch.scale;
    const iy = (pen.pinch.mid.y - pen.pinch.oy) / pen.pinch.scale;
    pen.scale = next;
    pen.ox = mid.x - ix * next;
    pen.oy = mid.y - iy * next;
    pen.userMoved = true;
    drawPenCanvas();
    return;
  }

  if (pen.drag && pen.drag.type === "pan") {
    pen.ox = pen.drag.ox + p.x - pen.drag.sx;
    pen.oy = pen.drag.oy + p.y - pen.drag.sy;
    pen.userMoved = true;
    drawPenCanvas();
    return;
  }

  if (pen.drag && pen.drag.type === "point") {
    if (!pen.drag.moved && Math.hypot(p.x - pen.drag.sx, p.y - pen.drag.sy) < 3) return;
    if (!pen.drag.moved) {
      pushPenHistory();
      pen.drag.moved = true;
    }
    pen.points[pen.drag.index] = toImage(p.x, p.y);
    drawPenCanvas();
    return;
  }

  // Перетягування по порожньому місцю рухає полотно
  if (pen.pending && Math.hypot(p.x - pen.pending.x, p.y - pen.pending.y) > (pen.pending.touch ? 10 : 6)) {
    pen.drag = { type: "pan", sx: pen.pending.x, sy: pen.pending.y, ox: pen.ox, oy: pen.oy };
    pen.pending = null;
    setPenCursor();
    return;
  }

  pen.hover = hitPoint(p.x, p.y);
  setPenCursor();
  drawPenCanvas();
});

function penPointerEnd(e) {
  pen.pointers.delete(e.pointerId);
  if (pen.pinch) {
    if (pen.pointers.size < 2) pen.pinch = null;
    pen.pending = null;
    pen.drag = null;
    return;
  }
  if (e.type === "pointercancel") {
    pen.drag = null;
    pen.pending = null;
    setPenCursor();
    return;
  }

  if (pen.drag) {
    if (pen.drag.type === "point" && !pen.drag.moved) {
      // Клік по першій точці замикає контур
      if (!pen.closed && pen.drag.index === 0 && pen.points.length >= 3) {
        pushPenHistory();
        pen.closed = true;
      }
    }
    pen.drag = null;
    setPenCursor();
    drawPenCanvas();
    return;
  }

  if (pen.pending) {
    const { x, y } = pen.pending;
    pen.pending = null;
    if (pen.closed) {
      toast("Контур уже замкнено. Можна перетягувати точки або відмінити крок", "info", 2400);
    } else {
      pushPenHistory();
      pen.points.push(toImage(x, y));
    }
    drawPenCanvas();
  }
}
penCanvas.addEventListener("pointerup", penPointerEnd);
penCanvas.addEventListener("pointercancel", penPointerEnd);

penCanvas.addEventListener("pointerleave", () => {
  pen.mouse.inside = false;
  if (!pen.drag) {
    pen.hover = -1;
    drawPenCanvas();
  }
});

penCanvas.addEventListener("contextmenu", (e) => e.preventDefault());

penCanvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const p = penPos(e);
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomPenAt(Math.exp(-delta * 0.0015), p.x, p.y);
  },
  { passive: false }
);

new ResizeObserver(() => {
  if (!penModeModal.open || !pen.img) return;
  const cx = pen.w / 2;
  const cy = pen.h / 2;
  resizePenCanvas();
  if (pen.userMoved) {
    pen.ox += pen.w / 2 - cx;
    pen.oy += pen.h / 2 - cy;
  } else {
    fitPen();
  }
  drawPenCanvas();
}).observe(penStage);

penModeModal.addEventListener("keydown", (e) => {
  if (isTyping(e)) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
    e.preventDefault();
    undoLastPenPoint();
  } else if (e.key === "Enter") {
    e.preventDefault();
    closePenPath();
  } else if (e.key === " ") {
    e.preventDefault();
    if (!pen.spaceHeld) {
      pen.spaceHeld = true;
      setPenCursor();
      drawPenCanvas();
    }
  } else if (e.key === "+" || e.key === "=") {
    zoomPenAt(1.25);
  } else if (e.key === "-" || e.key === "_") {
    zoomPenAt(0.8);
  } else if (e.key === "0") {
    fitPen();
    drawPenCanvas();
  } else if ((e.key === "Backspace" || e.key === "Delete") && !pen.closed && pen.points.length) {
    e.preventDefault();
    pushPenHistory();
    pen.points.pop();
    drawPenCanvas();
  }
});
penModeModal.addEventListener("keyup", (e) => {
  if (e.key === " ") {
    pen.spaceHeld = false;
    setPenCursor();
    drawPenCanvas();
  }
});

$("#undoPenBtn").addEventListener("click", undoLastPenPoint);
$("#clearPenBtn").addEventListener("click", () => {
  if (!pen.points.length) return;
  pushPenHistory();
  pen.points = [];
  pen.closed = false;
  drawPenCanvas();
});
$("#closePathBtn").addEventListener("click", closePenPath);
$("#zoomInBtn").addEventListener("click", () => zoomPenAt(1.25));
$("#zoomOutBtn").addEventListener("click", () => zoomPenAt(0.8));
zoomFitBtn.addEventListener("click", () => {
  fitPen();
  drawPenCanvas();
});
panModeBtn.addEventListener("click", () => {
  pen.panMode = !pen.panMode;
  panModeBtn.classList.toggle("active", pen.panMode);
  setPenCursor();
  drawPenCanvas();
});

async function cancelPen() {
  if (pen.points.length) {
    const ok = await confirmAction({
      title: "Закрити перо?",
      text: "Обведення не буде збережено.",
      ok: "Закрити без збереження"
    });
    if (!ok) return;
  }
  penModeModal.close();
}
$("#cancelPenBtn").addEventListener("click", cancelPen);
$("#cancelPenX").addEventListener("click", cancelPen);
penModeModal.addEventListener("cancel", (e) => {
  e.preventDefault();
  cancelPen();
});
penModeModal.addEventListener("close", () => {
  pen.obj = null;
  pen.img = null;
  pen.spaceHeld = false;
  pen.pointers.clear();
});

$("#savePenBtn").addEventListener("click", async () => {
  if (!pen.closed || pen.points.length < 3) {
    toast("Будь ласка, обведіть об'єкт, замкнувши контур (мінімум 3 точки).", "warn");
    return;
  }
  const obj = pen.obj;
  if (!obj) return;

  let x0 = 0;
  let y0 = 0;
  let x1 = pen.iw;
  let y1 = pen.ih;
  if ($("#penTrimCheck").checked) {
    const xs = pen.points.map((p) => p.x);
    const ys = pen.points.map((p) => p.y);
    x0 = Math.max(0, Math.floor(Math.min(...xs)));
    y0 = Math.max(0, Math.floor(Math.min(...ys)));
    x1 = Math.min(pen.iw, Math.ceil(Math.max(...xs)));
    y1 = Math.min(pen.ih, Math.ceil(Math.max(...ys)));
  }
  if (x1 - x0 < 2 || y1 - y0 < 2) {
    toast("Контур занадто малий", "warn");
    return;
  }

  const c = document.createElement("canvas");
  c.width = x1 - x0;
  c.height = y1 - y0;
  const ctx = c.getContext("2d");
  ctx.translate(-x0, -y0);
  ctx.beginPath();
  ctx.moveTo(pen.points[0].x, pen.points[0].y);
  pen.points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(pen.img, 0, 0, pen.iw, pen.ih);

  try {
    const blob = await canvasToBlob(c, "image/png");
    await commit(obj, { blob, op: "pen" });
    penModeModal.close();
    toast("Зображення успішно обрізано за контуром!", "success");
  } catch (err) {
    console.error(err);
    toast("Помилка при обрізанні зображення", "error");
  }
});

/* =========================================================
   Старт
   ========================================================= */
hydrateIcons();
syncThemeIcon();
window
  .matchMedia("(prefers-color-scheme: light)")
  .addEventListener("change", () => !document.documentElement.dataset.theme && syncThemeIcon());
updateUI();
