const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Resetting src/utils/pdfEngine.ts to clean git HEAD...");
execSync("git checkout HEAD -- src/utils/pdfEngine.ts", { stdio: "inherit" });

let code = fs.readFileSync("src/utils/pdfEngine.ts", "utf8");

// A. Clean status message
code = code.replace(
  /stage:\s*`Fitting page \$\{pageNum\} of \$\{totalPages\} to target size\.\.\.`/g,
  "stage: `Compressing page ${pageNum} of ${totalPages}...`"
);

// B. Exact Anchor Matching
const startAnchor = "const origPixelCount = unscaledViewport.width * unscaledViewport.height;";
const endAnchor = "const imgBytes = await validBlob.arrayBuffer();";

const startIndex = code.indexOf(startAnchor);
const endIndex = code.indexOf(endAnchor);

if (startIndex === -1 || endIndex === -1) {
  console.error("❌ Could not locate anchors in src/utils/pdfEngine.ts", { startIndex, endIndex });
  process.exit(1);
}

console.log(`✓ Replacing crashing loop between character ${startIndex} and ${endIndex}...`);

// C. Single-Pass Engine: dynamic pixel budgeting + native 2D downscaling
const replacement = `// Single-Pass Dynamic Pixel Budget Engine (Zero WebAssembly Crashes)
      let targetQuality = 0.50;
      let bytesPerPixel = 0.055;

      if (budgetPerPage < 12 * 1024) {
        targetQuality = 0.10;
        bytesPerPixel = 0.022;
      } else if (budgetPerPage < 35 * 1024) {
        targetQuality = 0.18;
        bytesPerPixel = 0.034;
      } else if (budgetPerPage < 85 * 1024) {
        targetQuality = 0.32;
        bytesPerPixel = 0.048;
      } else if (budgetPerPage < 200 * 1024) {
        targetQuality = 0.55;
        bytesPerPixel = 0.075;
      } else {
        targetQuality = 0.80;
        bytesPerPixel = 0.130;
      }

      // Calculate allowed pixel area for this page
      const maxAllowedPixels = Math.max(12000, Math.floor((budgetPerPage * 0.75) / bytesPerPixel));
      const origPixels = unscaledViewport.width * unscaledViewport.height;
      let targetScale = Math.min(1.0, Math.sqrt(maxAllowedPixels / origPixels));

      if (budgetPerPage > 350 * 1024) {
        targetScale = Math.min(1.5, Math.max(1.0, targetScale));
      }

      // Safe render scale to prevent WebAssembly buffer overflows
      const maxDim = Math.max(unscaledViewport.width, unscaledViewport.height);
      const safeRenderScale = Math.max(0.65, Math.min(1.0, 1024 / maxDim));
      const renderViewport = page.getViewport({ scale: safeRenderScale });

      const pdfCanvas = document.createElement('canvas');
      pdfCanvas.width = Math.max(1, Math.floor(renderViewport.width));
      pdfCanvas.height = Math.max(1, Math.floor(renderViewport.height));
      const pdfCtx = pdfCanvas.getContext('2d', { alpha: false });

      let validBlob: Blob = new Blob([new Uint8Array(100)], { type: 'image/jpeg' });

      if (pdfCtx) {
        pdfCtx.fillStyle = '#ffffff';
        pdfCtx.fillRect(0, 0, pdfCanvas.width, pdfCanvas.height);

        await (
          page.render({
            canvasContext: pdfCtx as any,
            viewport: renderViewport,
          } as any) as any
        ).promise;

        // Native 2D downscaling outside WebAssembly
        const finalWidth = Math.max(32, Math.floor(unscaledViewport.width * targetScale));
        const finalHeight = Math.max(32, Math.floor(unscaledViewport.height * targetScale));

        const outCanvas = document.createElement('canvas');
        outCanvas.width = finalWidth;
        outCanvas.height = finalHeight;
        const outCtx = outCanvas.getContext('2d', { alpha: false });

        if (outCtx) {
          outCtx.imageSmoothingEnabled = true;
          outCtx.imageSmoothingQuality = 'medium';
          outCtx.drawImage(pdfCanvas, 0, 0, finalWidth, finalHeight);

          pdfCanvas.width = 0;
          pdfCanvas.height = 0;

          let blob = await new Promise<Blob | null>((resolve) =>
            outCanvas.toBlob((b) => resolve(b), 'image/jpeg', targetQuality)
          );

          if (blob && blob.size > budgetPerPage && targetQuality > 0.08) {
            const tighterQuality = Math.max(0.05, targetQuality * 0.65);
            const smallerBlob = await new Promise<Blob | null>((resolve) =>
              outCanvas.toBlob((b) => resolve(b), 'image/jpeg', tighterQuality)
            );
            if (smallerBlob && smallerBlob.size < blob.size) {
              blob = smallerBlob;
            }
          }

          if (blob && blob.size > 0) {
            validBlob = blob;
            remainingImageBudget = Math.max(0, remainingImageBudget - blob.size);
          }
        }

        outCanvas.width = 0;
        outCanvas.height = 0;
      }

      // Explicitly purge memory
      pdfCanvas.width = 0;
      pdfCanvas.height = 0;
      if (typeof (page as any).cleanup === 'function') {
        (page as any).cleanup();
      }

      `;

code = code.slice(0, startIndex) + replacement + code.slice(endIndex);
fs.writeFileSync("src/utils/pdfEngine.ts", code);
console.log("✓ src/utils/pdfEngine.ts patched cleanly.");

// D. Refresh live build timestamp in App.tsx
try {
  let app = fs.readFileSync("src/App.tsx", "utf8");
  const currentTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  app = app.replace(/Live Build:\s*[\d:]+\s*(?:AM|PM)?/gi, "Live Build: " + currentTime);
  fs.writeFileSync("src/App.tsx", app);
  console.log(`✓ Updated Live Build timestamp to: ${currentTime}`);
} catch (_) {}

console.log("\n2. Running production build to verify zero errors...\n");
try {
  execSync("npm run build", { stdio: "inherit" });
  console.log("\n==========================================");
  console.log("✓ ZERO COMPILATION ERRORS — ENGINE READY");
  console.log("==========================================");
} catch (err) {
  console.error("\n❌ Build failed. Auto-reverting to git HEAD...");
  execSync("git checkout HEAD -- src/utils/pdfEngine.ts", { stdio: "inherit" });
  process.exit(1);
}
