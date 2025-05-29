const imageInput = document.getElementById("imageInput");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const togglePaddingBtn = document.getElementById("togglePaddingBtn");
const processBtn = document.getElementById("processBtn");
const codeInput = document.getElementById("codeInput");
const previewContainer = document.getElementById("previewContainer");

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
  img.src = URL.createObjectURL(file);
}

processBtn.addEventListener("click", async () => {
  if (!previewImages.length) return;

  const zip = new JSZip();
  const prefix = codeInput.value.trim() || "image";

  for (let i = 0; i < previewImages.length; i++) {
    const { file, individualPadding } = previewImages[i];
    await new Promise((resolve) => {
      processImage(file, individualPadding ? 50 : 0, (blob) => {
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
