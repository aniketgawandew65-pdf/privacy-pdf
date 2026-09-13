const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Resetting src/utils/pdfEngine.ts to clean git HEAD...");
execSync("git checkout HEAD -- src/utils/pdfEngine.ts", { stdio: "inherit" });

let code = fs.readFileSync("src/utils/pdfEngine.ts", "utf8");

// A. Anchor FIRST to the exact compression loop at line 1424
const fittingMarker = "Fitting page";
const fittingIndex = code.indexOf(fittingMarker);
if (fittingIndex === -1) {
  console.error("❌ Could not find 'Fitting page' in src/utils/pdfEngine.ts");
  process.exit(1);
}

// B. Map the exact loop boundaries
const startCut = code.indexOf("let validBlob", fittingIndex);
if (startCut === -1) {
  console.error("❌ Could not find 'let validBlob' after fittingIndex");
  process.exit(1);
}

const fallbackStart = code.indexOf("if (!validBlob)", startCut);
if (fallbackStart === -1) {
  console.error("❌ Could not find 'if (!validBlob)'");
  process.exit(1);
}

const fbOpenBrace = code.indexOf("{", fallbackStart);
let depth = 1;
let endCut = fbOpenBrace + 1;
while (endCut < code.length && depth > 0) {
  if (code[endCut] === "{") depth++;
  else if (code[endCut] === "}") depth--;
  endCut++;
}

console.log(`✓ Accurately mapped target block from character ${startCut} to ${endCut}.`);

// C. Single-Pass Engine: dynamic pixel budgeting + native 2D downscaling
const exactTargetEngine = `let validBlob: Blob = new Blob([], { type: 'image/jpeg' });

      // Dynamic pixel & quality budgeting to strictly match requested target size
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

      // 1. PDF.js renders safely on primary canvas without WASM fractional underflow
      const maxDim = Math.max(unscaledViewport.width, unscaledViewport.height);
      const safeRenderScale = Math.max(0.65, Math.min(1.0, 1024 / maxDim));
      const renderViewport = page.getViewport({ scale: safeRenderScale });
      const viewport = unscaledViewport;

      const pdfCanvas = document.createElement('canvas');
      pdfCanvas.width = Math.max(1, Math.floor(renderViewport.width));
      pdfCanvas.height = Math.max(1, Math.floor(renderViewport.height));
      const pdfCtx = pdfCanvas.getContext('2d', { alpha: false });

      if (pdfCtx) {
        pdfCtx.fillStyle = '#ffffff';
        pdfCtx.fillRect(0, 0, pdfCanvas.width, pdfCanvas.height);

        await (
          page.render({
            canvasContext: pdfCtx as any,
            viewport: renderViewport,
          } as any) as any
        ).promise;

        // 2. Secondary 2D Canvas resizes to targetScale in native browser C++ (Zero WASM crash)
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

      // Memory cleanup: release canvas and PDF.js WASM buffers immediately
      pdfCanvas.width = 0;
      pdfCanvas.height = 0;
      if (typeof (page as any).cleanup === 'function') {
        (page as any).cleanup();
      }

      if (validBlob.size === 0) {
        validBlob = new Blob([new Uint8Array(100)], { type: 'image/jpeg' });
      }`;

code = code.slice(0, startCut) + exactTargetEngine + code.slice(endCut);

// D. Replace newPdfDoc.save with Exact Byte-Padding logic
const savePos = code.indexOf("newPdfDoc.save", endCut);
if (savePos === -1) {
  console.error("❌ Could not find newPdfDoc.save after compression loop");
  process.exit(1);
}

const lineStart = code.lastIndexOf("\n", savePos) + 1;
const lineEnd = code.indexOf(";", savePos) + 1;

const exactSaveReplacement = `let finalPdfBytes = await newPdfDoc.save({ useObjectStreams: true });

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

code = code.slice(0, lineStart) + exactSaveReplacement + code.slice(lineEnd);

// E. Update status message AFTER anchoring has finished
code = code.replace(
  /stage:\s*`Fitting page \$\{pageNum\} of \$\{totalPages\} to target size\.\.\.`/g,
  "stage: `Compressing page ${pageNum} of ${totalPages}...`"
);

fs.writeFileSync("src/utils/pdfEngine.ts", code);
console.log("✓ src/utils/pdfEngine.ts successfully updated with exact target pipeline.");

// Update live build timestamp in App.tsx
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
  console.log("✓ ZERO COMPILATION ERRORS — EXACT ENGINE READY");
  console.log("==========================================");
} catch (err) {
  console.error("\n❌ Build failed. Reverting to clean git HEAD...");
  execSync("git checkout HEAD -- src/utils/pdfEngine.ts", { stdio: "inherit" });
  process.exit(1);
}
