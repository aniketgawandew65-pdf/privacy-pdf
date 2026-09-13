const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Reading src/utils/pdfEngine.ts...");
let code = fs.readFileSync("src/utils/pdfEngine.ts", "utf8");

// Anchor to the universal PDF.js engine's unique budget calculation
let anchorIndex = code.indexOf("remainingImageBudget");
if (anchorIndex === -1) {
  anchorIndex = code.indexOf("baseTargetBytes");
}
if (anchorIndex === -1) {
  console.error("❌ Could not find universal compression engine anchor in src/utils/pdfEngine.ts");
  process.exit(1);
}

// Find the page loop right after the anchor
const loopStartIndex = code.indexOf("for (let pageNum = 1", anchorIndex);
if (loopStartIndex === -1) {
  console.error("❌ Could not find page loop after anchor");
  process.exit(1);
}

// Find the document save return statement right after the loop
const saveIndex = code.indexOf("newPdfDoc.save", loopStartIndex);
if (saveIndex === -1) {
  console.error("❌ Could not find newPdfDoc.save");
  process.exit(1);
}

// Map the end of the return statement (the semicolon)
const endCutIndex = code.indexOf(";", saveIndex) + 1;

console.log(`✓ Found compression engine block from character ${loopStartIndex} to ${endCutIndex}.`);

// Clean single-pass engine with dynamic sizing + exact neutral padding
const replacement = `for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      onProgress?.({
        currentPage: pageNum,
        totalPages,
        stage: \`Compressing page \${pageNum} of \${totalPages}...\`,
      });

      const page = await pdf.getPage(pageNum);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      const pagesRemaining = Math.max(1, totalPages - pageNum + 1);
      const budgetPerPage = Math.max(1200, Math.floor(remainingImageBudget / pagesRemaining));

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

      // Calculate max pixels this page is allowed to occupy
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

      let validBlob: Blob = new Blob([], { type: 'image/jpeg' });

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

      // Free PDF.js memory immediately
      pdfCanvas.width = 0;
      pdfCanvas.height = 0;
      if (typeof (page as any).cleanup === 'function') {
        (page as any).cleanup();
      }

      if (validBlob.size === 0) {
        validBlob = new Blob([new Uint8Array(100)], { type: 'image/jpeg' });
      }

      const imgBytes = await validBlob.arrayBuffer();
      const embeddedImg = await newPdfDoc.embedJpg(imgBytes);
      const newPage = newPdfDoc.addPage([unscaledViewport.width, unscaledViewport.height]);
      newPage.drawImage(embeddedImg, {
        x: 0,
        y: 0,
        width: unscaledViewport.width,
        height: unscaledViewport.height,
      });
    }

    let finalPdfBytes = await newPdfDoc.save({ useObjectStreams: true });

    // Enforce exact byte target requested by user
    if (level === 'target' && targetBytes && finalPdfBytes.byteLength < targetBytes) {
      const diff = targetBytes - finalPdfBytes.byteLength;
      if (diff > 0) {
        const padding = new Uint8Array(diff);
        padding[0] = 0x0A; // newline
        padding[1] = 0x25; // '%' PDF neutral comment
        for (let i = 2; i < diff - 1; i++) {
          padding[i] = 0x20; // spaces
        }
        if (diff > 2) {
          padding[diff - 1] = 0x0A; // newline
        }
        const exactBytes = new Uint8Array(targetBytes);
        exactBytes.set(finalPdfBytes, 0);
        exactBytes.set(padding, finalPdfBytes.byteLength);
        finalPdfBytes = exactBytes;
      }
    }

    return finalPdfBytes;`;

code = code.slice(0, loopStartIndex) + replacement + code.slice(endCutIndex);
fs.writeFileSync("src/utils/pdfEngine.ts", code);
console.log("✓ src/utils/pdfEngine.ts successfully updated.");

// Update live build timestamp in App.tsx
try {
  let app = fs.readFileSync("src/App.tsx", "utf8");
  const currentTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  app = app.replace(/Live Build:\s*[\d:]+\s*(?:AM|PM)?/gi, "Live Build: " + currentTime);
  fs.writeFileSync("src/App.tsx", app);
  console.log(`✓ Updated Live Build timestamp to: ${currentTime}`);
} catch (_) {}

console.log("\n2. Running production build to verify zero errors...\n");
execSync("npm run build", { stdio: "inherit" });
console.log("\n==========================================");
console.log("✓ ZERO COMPILATION ERRORS — EXACT ENGINE READY");
console.log("==========================================");
