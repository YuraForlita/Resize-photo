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
  previewContainer.innerHTML = "";
  previewImages = [];
  Array.from(imageInput.files).forEach((file, index) => {
    const obj = { file, individualPadding: withPadding };
    previewImages.push(obj);
    createPreview(obj);
  });
});

function createPreview(obj) {
  const wrapper = document.createElement("div");
  wrapper.className = "preview";

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
cropBtn.style.right = "5px";
cropBtn.textContent = "✏️";
cropBtn.addEventListener("click", () => openCropModal(obj));
wrapper.appendChild(cropBtn);
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
  img.src = URL.createObjectURL(obj.file);
}

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
  img.src = URL.createObjectURL(file instanceof Blob ? file : file);
}
function openCropModal(obj) {
  currentCropObj = obj;
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
  reader.readAsDataURL(obj.file);
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

    // Для прев’ю оновлюємо
    const img = new Image();
    img.onload = () => {
      const ctx = currentCropObj.previewCtx;
      ctx.clearRect(0, 0, 200, 200);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 200, 200);

      const padding = currentCropObj.individualPadding ? 10 : 0;
      const maxSize = 200 - 2 * padding;
      const scale = Math.min(maxSize / img.width, maxSize / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      const x = (200 - w) / 2;
      const y = (200 - h) / 2;
      ctx.drawImage(img, x, y, w, h);
    };
    img.src = URL.createObjectURL(blob);

    closeCropModal();
  }, "image/jpeg", 1.0);
});

processBtn.addEventListener("click", async () => {
  if (!previewImages.length) return;

  const zip = new JSZip();
  const prefix = codeInput.value.trim() || "image";

  for (let i = 0; i < previewImages.length; i++) {
    const { file, croppedBlob, individualPadding } = previewImages[i];
const sourceFile = croppedBlob || file;

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
