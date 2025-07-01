const imageInput = document.getElementById("imageInput");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const togglePaddingBtn = document.getElementById("togglePaddingBtn");
const processBtn = document.getElementById("processBtn");
const codeInput = document.getElementById("codeInput");
const previewContainer = document.getElementById("previewContainer");
const cropModal = document.getElementById("cropModal");
const cropImage = document.getElementById("cropImage");
const saveCropBtn = document.getElementById("saveCropBtn");

let cropper;
let currentCropObj = null;
let withPadding = true;
let previewImages = [];

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

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "toggle-individual";
  toggleBtn.textContent = obj.individualPadding ? "🔲" : "✅";
  toggleBtn.addEventListener("click", () => {
    obj.individualPadding = !obj.individualPadding;
    toggleBtn.textContent = obj.individualPadding ? "🔲" : "✅";
    updatePreview(obj);
  });
  wrapper.appendChild(toggleBtn);

  const cropBtn = document.createElement("button");
  cropBtn.className = "toggle-individual";
  cropBtn.style.left = "auto";
  cropBtn.style.right = "35px";
  cropBtn.textContent = "✏️";
  cropBtn.addEventListener("click", () => openCropModal(obj));
  wrapper.appendChild(cropBtn);

  const removeBgBtn = document.createElement("button");
  removeBgBtn.className = "toggle-individual";
  removeBgBtn.style.left = "auto";
  removeBgBtn.style.right = "5px";
  removeBgBtn.textContent = "🧽";
  removeBgBtn.addEventListener("click", () => handleRemoveBackground(obj, removeBgBtn));
  wrapper.appendChild(removeBgBtn);
  
  const deleteBtn = document.createElement("button");
  deleteBtn.className = "toggle-individual";
  deleteBtn.style.left = "auto";
  deleteBtn.style.right = "65px";
  deleteBtn.textContent = "❌";
  deleteBtn.addEventListener("click", () => {
    const confirmed = confirm("Видалити це зображення?");
    if (confirmed) {
      const index = previewImages.indexOf(obj);
      if (index !== -1) {
        previewImages.splice(index, 1);
        renderPreviews();
      }
    }
  });
  wrapper.appendChild(deleteBtn);

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
    previewCtx.fillStyle = "#ffffff";
    previewCtx.fillRect(0, 0, 200, 200);

    const padding = obj.individualPadding ? 10 : 0;
    const maxSize = 200 - 2 * padding;
    const scale = Math.min(maxSize / img.width, maxSize / img.height);

    const newWidth = img.width * scale;
    const newHeight = img.height * scale;
    const x = (200 - newWidth) / 2;
    const y = (200 - newHeight) / 2;

    previewCtx.drawImage(img, x, y, newWidth, newHeight);
  };
  const source = obj.removeBgBlob || obj.croppedBlob || obj.file;
  img.src = URL.createObjectURL(source);
}

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

function openCropModal(obj) {
  currentCropObj = obj;
  const source = obj.removeBgBlob || obj.file;
  const reader = new FileReader();
  reader.onload = () => {
    cropImage.src = reader.result;
    cropModal.style.display = "flex";

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

function processImage(file, padding, callback) {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const maxSize = 1200 - 2 * padding;
    const scale = Math.min(maxSize / img.width, maxSize / img.height);

    const newWidth = img.width * scale;
    const newHeight = img.height * scale;
    const x = (canvas.width - newWidth) / 2;
    const y = (canvas.height - newHeight) / 2;

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
    const { file, croppedBlob, removeBgBlob, individualPadding } = previewImages[i];
    const sourceFile = removeBgBlob || croppedBlob || file;

    await new Promise((resolve) => {
      processImage(sourceFile, individualPadding ? 50 : 0, (blob) => {
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