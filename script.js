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
const manualCenteringModal = document.getElementById("manualCenteringModal");
const manualCenteringCanvas = document.getElementById("manualCenteringCanvas");
const manualCtx = manualCenteringCanvas.getContext("2d");
const manualCenteringSaveBtn = document.getElementById(
  "manualCenteringSaveBtn"
);
const manualCenteringCancelBtn = document.getElementById(
  "manualCenteringCancelBtn"
);
const pinModal = document.getElementById("pinModal");
const pinInput = document.getElementById("pinInput");
const pinSubmitBtn = document.getElementById("pinSubmitBtn");
const pinCancelBtn = document.getElementById("pinCancelBtn");
const togglePenModeBtn = document.getElementById("togglePenModeBtn");
const penModeModal = document.getElementById("penModeModal");
const penCanvas = document.getElementById("penCanvas");
const penCtx = penCanvas.getContext("2d");
const clearPenBtn = document.getElementById("clearPenBtn");
const savePenBtn = document.getElementById("savePenBtn");
const cancelPenBtn = document.getElementById("cancelPenBtn");
const undoPenBtn = document.getElementById("undoPenBtn");
const clearAllBtn = document.getElementById("clearAllBtn");

let cropper;
let currentCropObj = null;
let withPadding = true;
let previewImages = [];
let currentPreviewedIndex = null;
let manualCenteringImage = new Image();
let manualDrag = false;
let dragStart = { x: 0, y: 0 };
let dragOffset = { x: 0, y: 0 };
let manualCenteringCurrentObj = null;
let currentRemoveBgObj = null;
let currentRemoveBgButton = null;
let currentPenObj = null;
let penImage = new Image();
let drawingPoints = [];
let isDrawing = false;
let isClosed = false;
let penScale = 1;
const MAX_PEN_SCALE = 5;
let initialFitScale = 1;
let penOffsetX = 0;
let penOffsetY = 0;
let isDraggingPenCanvas = false;
let dragStartX = 0;
let dragStartY = 0;
let initialPenImageWidth = 0;
let initialPenImageHeight = 0;
let isDraggingPoint = false;
let draggedPointIndex = -1;
const pointHitRadius = 15;

let hasDragged = false;

togglePaddingBtn.addEventListener("click", () => {
  withPadding = !withPadding;
  togglePaddingBtn.textContent = withPadding
    ? "🔳 Вимкнути відступи"
    : "✅ Увімкнути відступи";
  previewImages.forEach((obj) => {
    obj.individualPadding = withPadding;
    updatePreview(obj);
  });
});

imageInput.addEventListener("change", () => {
  Array.from(imageInput.files).forEach((file) => {
    const obj = {
      file,
      individualPadding: withPadding,
      removeBgBlob: null,
      croppedBlob: null,
      manualOffset: { x: 0, y: 0 },
      penCroppedBlob: null
    };
    previewImages.push(obj);
  });
  renderPreviews();
});

previewContainer.addEventListener("click", (event) => {
  const target = event.target.closest(".preview");
  if (target) {
    currentPreviewedIndex = parseInt(target.dataset.index);
  }
});

function renderPreviews() {
  previewContainer.innerHTML = "";
  previewImages.forEach((obj) => createPreview(obj));
}

function undoLastPenPoint() {
  if (penModeModal.style.display !== "flex") {
    console.warn("undoLastPenPoint викликано, але модальне вікно не активне.");
    return;
  }

  if (drawingPoints.length > 0) {
    drawingPoints.pop();

    if (drawingPoints.length === 0) {
      isDrawing = false;
    }
    isClosed = false;

    drawPenCanvas();
    console.log(
      "Останню точку скасовано. Точок залишилось:",
      drawingPoints.length
    );
  } else {
    console.log("Немає точок для скасування.");
  }
}

undoPenBtn.addEventListener("click", () => {
  undoLastPenPoint();
});

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "z") {
    e.preventDefault();
    undoLastPenPoint();
  }
});

clearAllBtn.addEventListener("click", () => {
  if (confirm("Ви впевнені, що хочете видалити всі завантажені фото?")) {
    previewImages = [];
    renderPreviews();
    imageInput.value = "";
    currentPreviewedIndex = null;
  }
});

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
  deleteBtn.className = "toggle-individual delete-btn";
  deleteBtn.textContent = "❌";
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
  toggleBtn.className = "toggle-individual padding-toggle-btn";
  toggleBtn.textContent = obj.individualPadding ? "🔲" : "✅";
  toggleBtn.addEventListener("click", () => {
    obj.individualPadding = !obj.individualPadding;
    toggleBtn.textContent = obj.individualPadding ? "🔲" : "✅";
    updatePreview(obj);
  });
  wrapper.appendChild(toggleBtn);

  const cropBtn = document.createElement("button");
  cropBtn.className = "toggle-individual crop-btn";
  cropBtn.textContent = "✏️";
  cropBtn.addEventListener("click", () => openCropModal(obj));
  wrapper.appendChild(cropBtn);

  const menuBtn = document.createElement("button");
  menuBtn.className = "toggle-individual menu-btn";
  menuBtn.textContent = "⋮"; // Іконка трьох крапок
  wrapper.appendChild(menuBtn);

  const previewMenu = document.createElement("div");
  previewMenu.className = "preview-menu";
  wrapper.appendChild(previewMenu);

  const penModeIndividualBtn = document.createElement("button");
  penModeIndividualBtn.textContent = "✒️";
  penModeIndividualBtn.title = "Режим 'Перо'";
  penModeIndividualBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openPenModeModal(obj);
    previewMenu.classList.remove("active");
  });
  previewMenu.appendChild(penModeIndividualBtn);

  const removeBgBtn = document.createElement("button");
  removeBgBtn.textContent = "🧽";
  removeBgBtn.title = "Видалити фон";
  removeBgBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    handleRemoveBackground(obj, removeBgBtn);
    previewMenu.classList.remove("active");
  });
  previewMenu.appendChild(removeBgBtn);

  const manualCenterBtn = document.createElement("button");
  manualCenterBtn.textContent = "🎯";
  manualCenterBtn.title = "Ручне центрування";
  manualCenterBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    openManualCenteringModal(obj);
    previewMenu.classList.remove("active");
  });
  previewMenu.appendChild(manualCenterBtn);

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    document.querySelectorAll(".preview-menu.active").forEach((menu) => {
      if (menu !== previewMenu) {
        menu.classList.remove("active");
      }
    });
    previewMenu.classList.toggle("active");
  });

  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target) || e.target === canvasPreview) {
      previewMenu.classList.remove("active");
    }
  });

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

    const offset = obj.manualOffset || { x: 0, y: 0 };
    const offsetX = offset.x * 200;
    const offsetY = offset.y * 200;

    const x = (200 - newWidth) / 2 + offsetX;
    const y = (200 - newHeight) / 2 + offsetY;

    previewCtx.drawImage(img, x, y, newWidth, newHeight);
  };

  const source =
    obj.penCroppedBlob || obj.removeBgBlob || obj.croppedBlob || obj.file;
  img.src = URL.createObjectURL(source);
}

function openManualCenteringModal(obj) {
  manualCenteringCurrentObj = obj;

  const source =
    obj.penCroppedBlob || obj.removeBgBlob || obj.croppedBlob || obj.file;
  manualCenteringImage.src = URL.createObjectURL(source);

  dragOffset.x =
    (obj.manualOffset ? obj.manualOffset.x : 0) * manualCenteringCanvas.width;
  dragOffset.y =
    (obj.manualOffset ? obj.manualOffset.y : 0) * manualCenteringCanvas.height;

  manualCenteringModal.style.display = "block";

  manualCenteringImage.onload = () => {
    drawManualCenteringCanvas();
  };
}

function drawManualCenteringCanvas() {
  manualCtx.clearRect(
    0,
    0,
    manualCenteringCanvas.width,
    manualCenteringCanvas.height
  );
  manualCtx.fillStyle = "#ddd";
  manualCtx.fillRect(
    0,
    0,
    manualCenteringCanvas.width,
    manualCenteringCanvas.height
  );

  const scale = Math.min(
    manualCenteringCanvas.width / manualCenteringImage.width,
    manualCenteringCanvas.height / manualCenteringImage.height
  );
  const drawWidth = manualCenteringImage.width * scale;
  const drawHeight = manualCenteringImage.height * scale;

  const x = (manualCenteringCanvas.width - drawWidth) / 2 + dragOffset.x;
  const y = (manualCenteringCanvas.height - drawHeight) / 2 + dragOffset.y;

  manualCtx.drawImage(manualCenteringImage, x, y, drawWidth, drawHeight);

  drawGrid(
    manualCtx,
    manualCenteringCanvas.width,
    manualCenteringCanvas.height
  );
}

function drawGrid(ctx, width, height) {
  ctx.strokeStyle = "rgba(136, 136, 136, 0.4)";
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

  const limitX = manualCenteringCanvas.width / 2;
  const limitY = manualCenteringCanvas.height / 2;

  if (dragOffset.x > limitX) dragOffset.x = limitX;
  if (dragOffset.x < -limitX) dragOffset.x = -limitX;
  if (dragOffset.y > limitY) dragOffset.y = limitY;
  if (dragOffset.y < -limitY) dragOffset.y = -limitY;

  drawManualCenteringCanvas();
});

manualCenteringSaveBtn.addEventListener("click", () => {
  if (!manualCenteringCurrentObj) return;

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

function openCropModal(obj) {
  currentCropObj = obj;
  const source = obj.penCroppedBlob || obj.removeBgBlob || obj.file;
  const reader = new FileReader();
  reader.onload = () => {
    cropImage.src = reader.result;
    cropModal.style.display = "block";

    if (cropper) cropper.destroy();
    cropper = new Cropper(cropImage, {
      viewMode: 1,
      autoCropArea: 1
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

  cropper.getCroppedCanvas().toBlob(
    (blob) => {
      currentCropObj.croppedBlob = blob;
      currentCropObj.penCroppedBlob = null;
      updatePreview(currentCropObj);
      closeCropModal();
    },
    "image/png",
    1.0
  );
});

pinSubmitBtn.addEventListener("click", () => {
  const userPin = pinInput.value.trim();
  if (userPin === "1456") {
    pinModal.style.display = "none";
    processRemoveBackground(currentRemoveBgObj, currentRemoveBgButton);
  } else {
    alert("Невірний PIN-код.");
    pinInput.value = "";
  }
});

pinCancelBtn.addEventListener("click", () => {
  pinModal.style.display = "none";
  currentRemoveBgObj = null;
  currentRemoveBgButton = null;
});

function handleRemoveBackground(obj, button) {
  currentRemoveBgObj = obj;
  currentRemoveBgButton = button;
  pinInput.value = "";
  pinModal.style.display = "flex";
}

function processRemoveBackground(obj, button) {
  button.disabled = true;
  button.textContent = "⏳";

  const source = obj.penCroppedBlob || obj.croppedBlob || obj.file;
  const formData = new FormData();
  formData.append("image_file", source);
  formData.append("size", "auto");

  fetch("https://api.remove.bg/v1.0/removebg", {
    method: "POST",
    headers: {
      "X-Api-Key": "XqDCHZChV2MxuyvdxgyNMr7P"
    },
    body: formData
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
      alert("Помилка видалення фону. Перевірте консоль для деталей.");
    })
    .finally(() => {
      button.disabled = false;
    });
}

function openPenModeModal(obj) {
  currentPenObj = obj;
  penModeModal.style.display = "flex";
  loadCurrentImageToPenCanvas(currentPenObj);
}

cancelPenBtn.addEventListener("click", () => {
  penModeModal.style.display = "none";
  resetPenMode();
});

function loadCurrentImageToPenCanvas(obj) {
  const source =
    obj.penCroppedBlob || obj.removeBgBlob || obj.croppedBlob || obj.file;
  penImage.src = URL.createObjectURL(source);

  penImage.onload = () => {
    penCanvas.width = penCanvas.clientWidth;
    penCanvas.height = penCanvas.clientHeight;

    initialPenImageWidth = penImage.naturalWidth;
    initialPenImageHeight = penImage.naturalHeight;

    resetPenDrawingState();

    const canvasAspect = penCanvas.width / penCanvas.height;
    const imageAspect = initialPenImageWidth / initialPenImageHeight;

    if (imageAspect > canvasAspect) {
      penScale = penCanvas.width / initialPenImageWidth;
    } else {
      penScale = penCanvas.height / initialPenImageHeight;
    }
    penScale = Math.min(penScale, 1);
    initialFitScale = penScale;

    penOffsetX = (penCanvas.width - initialPenImageWidth * penScale) / 2;
    penOffsetY = (penCanvas.height - initialPenImageHeight * penScale) / 2;

    drawPenCanvas();
  };
  penImage.onerror = (e) => {
    console.error("Error loading image for pen canvas:", e);
    alert("Помилка завантаження зображення для режиму 'Перо'.");
    penModeModal.style.display = "none";
    resetPenMode();
  };
}

function resetPenDrawingState() {
  drawingPoints = [];
  isDrawing = false;
  isClosed = false;
  penScale = initialFitScale;
  penOffsetX = (penCanvas.width - initialPenImageWidth * penScale) / 2;
  penOffsetY = (penCanvas.height - initialPenImageHeight * penScale) / 2;
  penCtx.clearRect(0, 0, penCanvas.width, penCanvas.height);
}

function resetPenMode() {
  resetPenDrawingState();
  currentPenObj = null;
}

function drawPenCanvas() {
  penCtx.clearRect(0, 0, penCanvas.width, penCanvas.height);
  penCtx.fillStyle = "#f0f0f0";
  penCtx.fillRect(0, 0, penCanvas.width, penCanvas.height);

  if (penImage.complete && penImage.naturalWidth > 0) {
    penCtx.drawImage(
      penImage,
      penOffsetX,
      penOffsetY,
      initialPenImageWidth * penScale,
      initialPenImageHeight * penScale
    );
  } else {
    console.warn("Pen image not ready for drawing.");
  }

  if (drawingPoints.length > 0) {
    penCtx.strokeStyle = "cyan";
    penCtx.lineWidth = 2;
    penCtx.fillStyle = "white";

    penCtx.beginPath();
    penCtx.moveTo(
      drawingPoints[0].x * penScale + penOffsetX,
      drawingPoints[0].y * penScale + penOffsetY
    );

    for (let i = 0; i < drawingPoints.length; i++) {
      const p = drawingPoints[i];
      penCtx.lineTo(p.x * penScale + penOffsetX, p.y * penScale + penOffsetY);
      penCtx.arc(
        p.x * penScale + penOffsetX,
        p.y * penScale + penOffsetY,
        4,
        0,
        Math.PI * 2
      );
      penCtx.fill();
      penCtx.stroke();
      penCtx.beginPath();
      penCtx.moveTo(p.x * penScale + penOffsetX, p.y * penScale + penOffsetY);
    }

    if (!isClosed && drawingPoints.length > 0) {
      penCtx.lineTo(lastMouseX, lastMouseY);
      penCtx.stroke();
    } else if (isClosed) {
      penCtx.closePath();
      penCtx.stroke();
    }

    if (drawingPoints.length > 0 && !isClosed) {
      const firstPoint = drawingPoints[0];
      const mouseXInImageCoords = (lastMouseX - penOffsetX) / penScale;
      const mouseYInImageCoords = (lastMouseY - penOffsetY) / penScale;

      const dist = Math.sqrt(
        Math.pow(mouseXInImageCoords - firstPoint.x, 2) +
          Math.pow(mouseYInImageCoords - firstPoint.y, 2)
      );
      if (dist < 10 / penScale) {
        penCtx.beginPath();
        penCtx.arc(
          firstPoint.x * penScale + penOffsetX,
          firstPoint.y * penScale + penOffsetY,
          6,
          0,
          Math.PI * 2
        );
        penCtx.strokeStyle = "red";
        penCtx.lineWidth = 2;
        penCtx.stroke();
      }
    }
  }
}

penCanvas.addEventListener("mousemove", (e) => {
  const rect = penCanvas.getBoundingClientRect();
  lastMouseX = e.clientX - rect.left;
  lastMouseY = e.clientY - rect.top;

  if (isDraggingPenCanvas) {
    hasDragged = true;
    const dx = lastMouseX - dragStartX;
    const dy = lastMouseY - dragStartY;
    penOffsetX += dx;
    penOffsetY += dy;
    dragStartX = lastMouseX;
    dragStartY = lastMouseY;
    drawPenCanvas();
    return;
  }

  if (isDraggingPoint) {
    hasDragged = true;
    const pointX = (lastMouseX - penOffsetX) / penScale;
    const pointY = (lastMouseY - penOffsetY) / penScale;

    drawingPoints[draggedPointIndex].x = pointX;
    drawingPoints[draggedPointIndex].y = pointY;
    isClosed = false;
    drawPenCanvas();
    return;
  }

  if (!isClosed) {
    let overPoint = false;

    const mouseXInImageCoords = (lastMouseX - penOffsetX) / penScale;
    const mouseYInImageCoords = (lastMouseY - penOffsetY) / penScale;

    for (let i = 0; i < drawingPoints.length; i++) {
      const point = drawingPoints[i];
      const dist = Math.sqrt(
        Math.pow(mouseXInImageCoords - point.x, 2) +
          Math.pow(mouseYInImageCoords - point.y, 2)
      );

      if (dist < pointHitRadius / penScale) {
        overPoint = true;
        break;
      }
    }
    penCanvas.style.cursor = overPoint ? "grab" : "crosshair";
  } else {
    penCanvas.style.cursor = "crosshair";
  }

  if (!isDraggingPoint && !isDraggingPenCanvas) {
    drawPenCanvas();
  }
});

penCanvas.addEventListener("mousedown", (e) => {
  hasDragged = false;
  const rect = penCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  if (e.button === 2) {
    isDraggingPenCanvas = true;
    dragStartX = mouseX;
    dragStartY = mouseY;
    penCanvas.style.cursor = "grabbing";
    return;
  } else if (e.button === 0) {
    const mouseXInImageCoords = (mouseX - penOffsetX) / penScale;
    const mouseYInImageCoords = (mouseY - penOffsetY) / penScale;

    for (let i = 0; i < drawingPoints.length; i++) {
      const point = drawingPoints[i];
      const dist = Math.sqrt(
        Math.pow(mouseXInImageCoords - point.x, 2) +
          Math.pow(mouseYInImageCoords - point.y, 2)
      );

      if (dist < pointHitRadius / penScale) {
        isDraggingPoint = true;
        draggedPointIndex = i;
        penCanvas.style.cursor = "grabbing";
        drawPenCanvas();
        return;
      }
    }
  }
  drawPenCanvas();
});

penCanvas.addEventListener("mouseup", (e) => {
  const wasDraggingPoint = isDraggingPoint;
  const wasDraggingPenCanvas = isDraggingPenCanvas;

  isDraggingPoint = false;
  draggedPointIndex = -1;
  isDraggingPenCanvas = false;

  penCanvas.style.cursor = "crosshair";

  if (e.button === 0 && !hasDragged) {
    if (isClosed) {
      drawPenCanvas();
      return;
    }

    const rect = penCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const pointX = (mouseX - penOffsetX) / penScale;
    const pointY = (mouseY - penOffsetY) / penScale;

    if (drawingPoints.length > 0) {
      const firstPoint = drawingPoints[0];
      const dist = Math.sqrt(
        Math.pow(pointX - firstPoint.x, 2) + Math.pow(pointY - firstPoint.y, 2)
      );

      if (dist < pointHitRadius / penScale && drawingPoints.length >= 2) {
        isClosed = true;
      }
    }

    drawingPoints.push({ x: pointX, y: pointY });
    isDrawing = true;
  }

  drawPenCanvas();
});

penCanvas.addEventListener("mouseleave", () => {
  isDraggingPenCanvas = false;
  penCanvas.style.cursor = "crosshair";
});

penCanvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

penCanvas.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const scaleAmount = 0.1;
      const oldScale = penScale;

      if (e.deltaY < 0) {
        penScale += scaleAmount;
      } else {
        penScale -= scaleAmount;
      }

      penScale = Math.max(initialFitScale, Math.min(penScale, MAX_PEN_SCALE));

      const rect = penCanvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const mouseXInImageCoords = (mouseX - penOffsetX) / oldScale;
      const mouseYInImageCoords = (mouseY - penOffsetY) / oldScale;

      penOffsetX = mouseX - mouseXInImageCoords * penScale;
      penOffsetY = mouseY - mouseYInImageCoords * penScale;

      drawPenCanvas();
    }
  },
  { passive: false }
);

clearPenBtn.addEventListener("click", () => {
  drawingPoints = [];
  isDrawing = false;
  isClosed = false;
  drawPenCanvas();
});

savePenBtn.addEventListener("click", () => {
  console.log("Save button clicked.");
  if (!isClosed || drawingPoints.length < 3) {
    console.log(
      "Path not closed or not enough points. isClosed:",
      isClosed,
      "drawingPoints.length:",
      drawingPoints.length
    );
    alert("Будь ласка, обведіть об'єкт, замкнувши контур (мінімум 3 точки).");
    return;
  }

  const objToUpdate = currentPenObj;
  if (!objToUpdate) {
    console.error(
      "currentPenObj is null/undefined. This should not happen if an image was selected."
    );
    alert("Зображення для збереження не знайдено. Спробуйте ще раз.");
    return;
  }

  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");

  tempCanvas.width = initialPenImageWidth;
  tempCanvas.height = initialPenImageHeight;
  console.log("tempCanvas dimensions:", tempCanvas.width, tempCanvas.height);

  tempCtx.beginPath();

  if (drawingPoints.length > 0) {
    tempCtx.moveTo(drawingPoints[0].x, drawingPoints[0].y);
    for (let i = 1; i < drawingPoints.length; i++) {
      tempCtx.lineTo(drawingPoints[i].x, drawingPoints[i].y);
    }
    tempCtx.closePath();
  } else {
    console.error("No drawing points available for clipping.");
    alert("Немає точок для обрізання. Будь ласка, обведіть об'єкт.");
    return;
  }

  try {
    tempCtx.clip();
    console.log("Path clipped successfully.");
  } catch (clipError) {
    console.error("Error during ctx.clip():", clipError);
    alert("Помилка при обрізанні контуру. Можливо, контур недійсний.");
    return;
  }

  if (
    !penImage.complete ||
    penImage.naturalWidth === 0 ||
    penImage.naturalHeight === 0
  ) {
    console.error(
      "penImage not loaded or has zero dimensions! Complete:",
      penImage.complete,
      "Natural Width:",
      penImage.naturalWidth,
      "Natural Height:",
      penImage.naturalHeight
    );
    alert(
      "Зображення ще не завантажено або має нульові розміри. Спробуйте ще раз."
    );
    return;
  }
  try {
    tempCtx.drawImage(
      penImage,
      0,
      0,
      initialPenImageWidth,
      initialPenImageHeight
    );
    console.log("Image drawn onto temp canvas successfully.");
  } catch (drawError) {
    console.error("Error drawing image onto temp canvas:", drawError);
    alert("Помилка при малюванні зображення на тимчасовому полотні.");
    return;
  }

  try {
    tempCanvas.toBlob(
      (blob) => {
        console.log("toBlob callback fired. Blob:", blob);
        if (blob) {
          currentPenObj.penCroppedBlob = blob;
          currentPenObj.removeBgBlob = null;
          currentPenObj.croppedBlob = null;
          updatePreview(currentPenObj);
          penModeModal.style.display = "none";
          resetPenMode();
          alert("Зображення успішно обрізано за контуром!");
        } else {
          console.error(
            "Blob is null or undefined. Canvas might be empty or corrupted."
          );
          alert(
            "Помилка при обрізанні зображення: Blob порожній або не вдалося створити."
          );
        }
      },
      "image/png",
      1.0
    );
    console.log("toBlob method called.");
  } catch (toBlobError) {
    console.error("Error calling toBlob:", toBlobError);
    alert("Помилка при виклику toBlob для обрізаного зображення.");
  }
});

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
  if (!previewImages.length) {
    alert("Будь ласка, завантажте зображення для обробки.");
    return;
  }

  const zip = new JSZip();
  const prefix = codeInput.value.trim() || "image";

  for (let i = 0; i < previewImages.length; i++) {
    const {
      file,
      croppedBlob,
      removeBgBlob,
      penCroppedBlob,
      individualPadding,
      manualOffset
    } = previewImages[i];
    const sourceFile = penCroppedBlob || removeBgBlob || croppedBlob || file;

    await new Promise((resolve) => {
      processImage(
        sourceFile,
        individualPadding ? 50 : 0,
        manualOffset,
        (blob) => {
          zip.file(`${prefix}_${i + 1}.jpg`, blob);
          resolve();
        }
      );
    });
  }

  zip
    .generateAsync({ type: "blob" })
    .then((content) => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = `${prefix}_images.zip`;
      link.click();
      alert("ZIP-архів успішно сформовано та завантажено!");
    })
    .catch((err) => {
      console.error("Error generating ZIP:", err);
      alert("Помилка при формуванні ZIP-архіву.");
    });
});
