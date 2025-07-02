const imageInput = document.getElementById("imageInput");
const canvas = document.createElement("canvas");
canvas.width = 1200;
canvas.height = 1200;
const ctx = canvas.getContext("2d");
const togglePaddingBtn = document.getElementById("togglePaddingBtn");
const processBtn = document.getElementById("processBtn");
const codeInput = document.getElementById("codeInput");
const previewContainer = document.getElementById("previewContainer");
const cropModal = document.getElementById("cropModal");
const cropImage = document.getElementById("cropImage");
const saveCropBtn = document.getElementById("saveCropBtn");

// --- MANUAL CENTERING ---
const manualCenteringModal = document.getElementById("manualCenteringModal");
const manualCenteringCanvas = document.getElementById("manualCenteringCanvas");
const manualCtx = manualCenteringCanvas.getContext("2d");
const manualCenteringSaveBtn = document.getElementById("manualCenteringSaveBtn");
const manualCenteringCancelBtn = document.getElementById("manualCenteringCancelBtn");

let cropper;
let currentCropObj = null;
let withPadding = true;
let previewImages = [];

// MANUAL CENTERING vars
let manualCenteringImage = new Image();
let manualDrag = false;
let dragStart = { x: 0, y: 0 };
let dragOffset = { x: 0, y: 0 };
let manualCenteringCurrentObj = null;

togglePaddingBtn.addEventListener("click", () => {
  withPadding = !withPadding;
  togglePaddingBtn.textContent = withPadding
    ? "Вимкнути відступи (для всіх)"
    : "Увімкнути відступи (для всіх)";
  previewImages.forEach((obj) => {
    obj.individualPadding = withPadding;
    updatePreview(obj);
  });
});

imageInput.addEventListener("change", () => {
  previewImages = [];
  Array.from(imageInput.files).forEach((file) => {
    const obj = {
      file,
      individualPadding: withPadding,
      removeBgBlob: null,
      croppedBlob: null,
      manualOffset: { x: 0, y: 0 } // нормалізоване зміщення
    };
    previewImages.push(obj);
  });
  renderPreviews();
});

function renderPreviews() {
  previewContainer.innerHTML = "";
  previewImages.forEach((obj) => createPreview(obj));
}

function createPreview(obj) {
  const wrapper = document.createElement("div");
  wrapper.className = "preview";
  wrapper.draggable = true;
  wrapper.dataset.index = previewImages.indexOf(obj);

  wrapper.addEventListener("dragstart", (e) => {
    e.dataTransfer.setData("text/plain", wrapper.dataset.index);
    wrapper.style.opacity = "0.5";
  });
  wrapper.addEventListener("dragend", () => {
    wrapper.style.opacity = "1";
  });
  wrapper.addEventListener("dragover", (e) => {
    e.preventDefault();
    wrapper.style.border = "2px dashed #666";
  });
  wrapper.addEventListener("dragleave", () => {
    wrapper.style.border = "none";
  });
  wrapper.addEventListener("drop", (e) => {
    e.preventDefault();
    wrapper.style.border = "none";

    const fromIndex = parseInt(e.dataTransfer.getData("text/plain"));
    const toIndex = parseInt(wrapper.dataset.index);

    if (fromIndex === toIndex) return;

    const moved = previewImages.splice(fromIndex, 1)[0];
    previewImages.splice(toIndex, 0, moved);

    renderPreviews();
  });

  const canvasPreview = document.createElement("canvas");
  canvasPreview.width = 200;
  canvasPreview.height = 200;
  wrapper.appendChild(canvasPreview);

  const deleteBtn = document.createElement("button");
deleteBtn.className = "toggle-individual";
deleteBtn.textContent = "❌";
deleteBtn.style.top = "0";
deleteBtn.style.right = "5px";
deleteBtn.style.bottom = "";
deleteBtn.addEventListener("click", () => {
  if (confirm("Видалити це зображення?")) {
    const index = previewImages.indexOf(obj);
    if (index !== -1) {
      previewImages.splice(index, 1);
      renderPreviews();
    }
  }
});
wrapper.appendChild(deleteBtn);

const toggleBtn = document.createElement("button");
toggleBtn.className = "toggle-individual";
toggleBtn.textContent = obj.individualPadding ? "🔲" : "✅";
toggleBtn.style.bottom = "5px";
toggleBtn.style.left = "5px";
toggleBtn.style.top = "";
toggleBtn.style.right = "";
toggleBtn.addEventListener("click", () => {
  obj.individualPadding = !obj.individualPadding;
  toggleBtn.textContent = obj.individualPadding ? "🔲" : "✅";
  updatePreview(obj);
});
wrapper.appendChild(toggleBtn);

const cropBtn = document.createElement("button");
cropBtn.className = "toggle-individual";
cropBtn.textContent = "✏️";
cropBtn.style.bottom = "5px";
cropBtn.style.right = "75px";
cropBtn.style.top = "";
cropBtn.addEventListener("click", () => openCropModal(obj));
wrapper.appendChild(cropBtn);

const manualCenterBtn = document.createElement("button");
manualCenterBtn.className = "toggle-individual";
manualCenterBtn.textContent = "🎯";
manualCenterBtn.style.bottom = "5px";
manualCenterBtn.style.right = "5px";
manualCenterBtn.style.top = "";
manualCenterBtn.title = "Ручне центрування";
manualCenterBtn.addEventListener("click", () => openManualCenteringModal(obj));
wrapper.appendChild(manualCenterBtn);

const removeBgBtn = document.createElement("button");
removeBgBtn.className = "toggle-individual";
removeBgBtn.textContent = "🧽";
removeBgBtn.style.bottom = "5px";
removeBgBtn.style.right = "40px";
removeBgBtn.style.top = "";
removeBgBtn.addEventListener("click", () => handleRemoveBackground(obj, removeBgBtn));
wrapper.appendChild(removeBgBtn);
  
  
  previewContainer.appendChild(wrapper);
  previewContainer.style.display = "flex";

  obj.previewCanvas = canvasPreview;
  obj.previewCtx = canvasPreview.getContext("2d");

  updatePreview(obj);
}

function updatePreview(obj) {
  const img = new Image();
  img.onload = () => {
    const previewCtx = obj.previewCtx;
    previewCtx.clearRect(0, 0, 200, 200);
    previewCtx.fillStyle = "#ffffff";
    previewCtx.fillRect(0, 0, 200, 200);

    const padding = obj.individualPadding ? 10 : 0;
    const maxSize = 200 - 2 * padding;
    const scale = Math.min(maxSize / img.width, maxSize / img.height);

    const newWidth = img.width * scale;
    const newHeight = img.height * scale;

    // Зміщення у нормалізованих координатах => переводимо в пікселі превʼю (200x200)
    const offset = obj.manualOffset || { x: 0, y: 0 };
    const offsetX = offset.x * 200;
    const offsetY = offset.y * 200;

    const x = (200 - newWidth) / 2 + offsetX;
    const y = (200 - newHeight) / 2 + offsetY;

    previewCtx.drawImage(img, x, y, newWidth, newHeight);
  };

  const source = obj.removeBgBlob || obj.croppedBlob || obj.file;
  img.src = URL.createObjectURL(source);
}

// --- Ручне центрування ---

function openManualCenteringModal(obj) {
  manualCenteringCurrentObj = obj;

  const source = obj.removeBgBlob || obj.croppedBlob || obj.file;
  manualCenteringImage.src = URL.createObjectURL(source);

  // Встановити початкове зміщення у пікселях канваса 400x400
  dragOffset.x = (obj.manualOffset ? obj.manualOffset.x : 0) * manualCenteringCanvas.width;
  dragOffset.y = (obj.manualOffset ? obj.manualOffset.y : 0) * manualCenteringCanvas.height;

  manualCenteringModal.style.display = "block";

  manualCenteringImage.onload = () => {
    drawManualCenteringCanvas();
  };
}

function drawManualCenteringCanvas() {
  manualCtx.clearRect(0, 0, manualCenteringCanvas.width, manualCenteringCanvas.height);
  manualCtx.fillStyle = "#ddd";
  manualCtx.fillRect(0, 0, manualCenteringCanvas.width, manualCenteringCanvas.height);

  const scale = Math.min(
    manualCenteringCanvas.width / manualCenteringImage.width,
    manualCenteringCanvas.height / manualCenteringImage.height
  );
  const drawWidth = manualCenteringImage.width * scale;
  const drawHeight = manualCenteringImage.height * scale;

  const x = (manualCenteringCanvas.width - drawWidth) / 2 + dragOffset.x;
  const y = (manualCenteringCanvas.height - drawHeight) / 2 + dragOffset.y;

  // 🖼️ Малюємо спочатку зображення
  manualCtx.drawImage(manualCenteringImage, x, y, drawWidth, drawHeight);

  // ➕ Потім сітку поверх
  drawGrid(manualCtx, manualCenteringCanvas.width, manualCenteringCanvas.height);
}

function drawGrid(ctx, width, height) {
  ctx.strokeStyle = "rgba(136, 136, 136, 0.4)"; // Світло-сіра, прозора
  ctx.lineWidth = 1;

  const step = 50;
  for (let x = 0; x <= width; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += step) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // 🔴 Центр — червоний, напівпрозорий
  ctx.strokeStyle = "rgba(255, 0, 0, 0.6)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();
}

// Обробка миші для drag & drop
manualCenteringCanvas.addEventListener("mousedown", (e) => {
  manualDrag = true;
  dragStart.x = e.offsetX;
  dragStart.y = e.offsetY;
  manualCenteringCanvas.style.cursor = "grabbing";
});

manualCenteringCanvas.addEventListener("mouseup", (e) => {
  manualDrag = false;
  manualCenteringCanvas.style.cursor = "grab";
});

manualCenteringCanvas.addEventListener("mouseleave", (e) => {
  manualDrag = false;
  manualCenteringCanvas.style.cursor = "grab";
});

manualCenteringCanvas.addEventListener("mousemove", (e) => {
  if (!manualDrag) return;
  const dx = e.offsetX - dragStart.x;
  const dy = e.offsetY - dragStart.y;
  dragStart.x = e.offsetX;
  dragStart.y = e.offsetY;

  dragOffset.x += dx;
  dragOffset.y += dy;

  // Обмежуємо, щоб не вийти за межі +/- (половина канвасу)
  const limitX = manualCenteringCanvas.width / 2;
  const limitY = manualCenteringCanvas.height / 2;

  if(dragOffset.x > limitX) dragOffset.x = limitX;
  if(dragOffset.x < -limitX) dragOffset.x = -limitX;
  if(dragOffset.y > limitY) dragOffset.y = limitY;
  if(dragOffset.y < -limitY) dragOffset.y = -limitY;

  drawManualCenteringCanvas();
});

manualCenteringSaveBtn.addEventListener("click", () => {
  if (!manualCenteringCurrentObj) return;

  // Зберігаємо нормалізоване зміщення (-0.5..+0.5) -> (-1..+1) у відсотках від canvas.width
  manualCenteringCurrentObj.manualOffset = {
    x: dragOffset.x / manualCenteringCanvas.width,
    y: dragOffset.y / manualCenteringCanvas.height
  };

  updatePreview(manualCenteringCurrentObj);
  manualCenteringModal.style.display = "none";
});

manualCenteringCancelBtn.addEventListener("click", () => {
  manualCenteringModal.style.display = "none";
  manualCenteringCurrentObj = null;
});

// --- Обрізка ---

function openCropModal(obj) {
  currentCropObj = obj;
  const source = obj.removeBgBlob || obj.file;
  const reader = new FileReader();
  reader.onload = () => {
    cropImage.src = reader.result;
    cropModal.style.display = "block";

    if (cropper) cropper.destroy();
    cropper = new Cropper(cropImage, {
      viewMode: 1,
      autoCropArea: 1,
    });
  };
  reader.readAsDataURL(source);
}

function closeCropModal() {
  if (cropper) cropper.destroy();
  cropper = null;
  cropModal.style.display = "none";
}

saveCropBtn.addEventListener("click", () => {
  if (!cropper || !currentCropObj) return;

  cropper.getCroppedCanvas().toBlob((blob) => {
    currentCropObj.croppedBlob = blob;
    updatePreview(currentCropObj);
    closeCropModal();
  }, "image/png", 1.0);
});

// --- Remove.bg (залишив без змін) ---

function handleRemoveBackground(obj, button) {
  const userPin = prompt("Введіть PIN-код (4 цифри):");

  if (userPin === null || userPin.trim() !== "1456") {
    alert("Невірний PIN-код або операцію скасовано.");
    return;
  }

  button.disabled = true;
  button.textContent = "⏳";

  const source = obj.croppedBlob || obj.file;
  const formData = new FormData();
  formData.append("image_file", source);
  formData.append("size", "auto");

  fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: {
      "X-Api-Key": "XqDCHZChV2MxuyvdxgyNMr7P",
    },
    body: formData,
  })
    .then((res) => {
      if (!res.ok) throw new Error("Помилка remove.bg");
      return res.blob();
    })
    .then((blob) => {
      obj.removeBgBlob = blob;
      updatePreview(obj);
      button.textContent = "✅";
    })
    .catch((err) => {
      console.error("remove.bg error:", err);
      button.textContent = "⚠️";
    })
    .finally(() => {
      button.disabled = false;
    });
}

// --- Обробка для скачування ---

function processImage(file, padding, manualOffset, callback) {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const maxSize = 1200 - 2 * padding;
    const scale = Math.min(maxSize / img.width, maxSize / img.height);

    const newWidth = img.width * scale;
    const newHeight = img.height * scale;

    const offsetX = (manualOffset?.x || 0) * canvas.width;
    const offsetY = (manualOffset?.y || 0) * canvas.height;

    const x = (canvas.width - newWidth) / 2 + offsetX;
    const y = (canvas.height - newHeight) / 2 + offsetY;

    ctx.drawImage(img, x, y, newWidth, newHeight);
    canvas.toBlob(callback, "image/jpeg", 1.0);
  };
  img.src = URL.createObjectURL(file);
}

processBtn.addEventListener("click", async () => {
  if (!previewImages.length) return;

  const zip = new JSZip();
  const prefix = codeInput.value.trim() || "image";

  for (let i = 0; i < previewImages.length; i++) {
    const { file, croppedBlob, removeBgBlob, individualPadding, manualOffset } = previewImages[i];
    const sourceFile = removeBgBlob || croppedBlob || file;

    await new Promise((resolve) => {
      processImage(sourceFile, individualPadding ? 50 : 0, manualOffset, (blob) => {
        zip.file(`${prefix}_${i + 1}.jpg`, blob);
        resolve();
      });
    });
  }

  zip.generateAsync({ type: "blob" }).then((content) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(content);
    link.download = `${prefix}_images.zip`;
    link.click();
  });
});