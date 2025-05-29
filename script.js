const imageInput = document.getElementById("imageInput");
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    const downloadBtn = document.getElementById("downloadBtn");

    imageInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const img = new Image();
      img.onload = () => {
        // Очистити полотно
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Білий фон
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Обчислити масштаб до 1000x1000
        const maxSize = 1000;
        let scale = Math.min(maxSize / img.width, maxSize / img.height);
        const newWidth = img.width * scale;
        const newHeight = img.height * scale;

        // Обчислити координати для центрування
        const x = (canvas.width - newWidth) / 2;
        const y = (canvas.height - newHeight) / 2;

        // Намалювати зображення
        ctx.drawImage(img, x, y, newWidth, newHeight);

        downloadBtn.style.display = "inline-block";
      };
      img.src = URL.createObjectURL(file);
    });

    downloadBtn.addEventListener("click", () => {
      const link = document.createElement("a");
      link.download = "image_1200x1200.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    });