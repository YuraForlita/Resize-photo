const imageInput = document.getElementById("imageInput");
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    const downloadBtn = document.getElementById("downloadBtn");
    const togglePaddingBtn = document.getElementById("togglePaddingBtn");

    let withPadding = true; // Режим з відступами (включено за замовчуванням)

    togglePaddingBtn.addEventListener("click", () => {
      withPadding = !withPadding;
      togglePaddingBtn.textContent = withPadding
        ? "🔲 Вимкнути відступи"
        : "✅ Увімкнути відступи";
      
      // Якщо вже завантажено зображення — перемалювати
      if (imageInput.files[0]) {
        processImage(imageInput.files[0]);
      }
    });

    imageInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (file) {
        processImage(file);
      }
    });

    function processImage(file) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const padding = withPadding ? 50 : 0;
        const maxSize = 1200 - 2 * padding;
        const scale = Math.min(maxSize / img.width, maxSize / img.height);

        const newWidth = img.width * scale;
        const newHeight = img.height * scale;
        const x = (canvas.width - newWidth) / 2;
        const y = (canvas.height - newHeight) / 2;

        ctx.drawImage(img, x, y, newWidth, newHeight);
        downloadBtn.style.display = "inline-block";
      };
      img.src = URL.createObjectURL(file);
    }

    downloadBtn.addEventListener("click", () => {
      const link = document.createElement("a");
      link.download = "image_1200x1200.jpg";
      link.href = canvas.toDataURL("image/jpeg", 1.0);
      link.click();
    });
