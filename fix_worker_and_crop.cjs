const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Fixing PDF.js worker and download logic in CropPdf.tsx...");
let crop = fs.readFileSync("src/components/CropPdf.tsx", "utf8");

// A. Fix the broken CDN worker URL that threw the fake worker error
// Use standard unpkg or match the local/vite configuration
const brokenWorkerPattern = /pdfjsLib\.GlobalWorkerOptions\.workerSrc\s*=\s*`[^`]+`;?/;
const cleanWorkerSetup = `try {
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = \`https://unpkg.com/pdfjs-dist@\${pdfjsLib.version}/build/pdf.worker.min.js\`;
  }
} catch (_) {}`;

if (brokenWorkerPattern.test(crop)) {
  crop = crop.replace(brokenWorkerPattern, cleanWorkerSetup);
  console.log("✓ Restored standard worker initialization.");
}

// B. Ensure download crops the file using both MediaBox and CropBox
// This fixes the issue where downloaded PDFs remained uncropped
const downloadLogicRegex = /pages\.forEach\(\(page,\s*i\)\s*=>\s*\{[\s\S]*?\}\);/;
const fixedDownloadLogic = `pages.forEach((page, i) => {
        const pageIdx = i + 1;
        const targetCrop = applyToAll ? cropBox : (crops[pageIdx] || (pageIdx === currentPage ? cropBox : null));
        if (!targetCrop) return;

        const mediaBox = page.getMediaBox();
        const originX = mediaBox.x || 0;
        const originY = mediaBox.y || 0;
        const pageWidth = mediaBox.width || page.getWidth();
        const pageHeight = mediaBox.height || page.getHeight();

        const canvasEl = canvasRef.current;
        const dispW = canvasEl ? (canvasEl.clientWidth || canvasEl.width || 600) : 600;
        const dispH = canvasEl ? (canvasEl.clientHeight || canvasEl.height || 800) : 800;

        const fracX = Math.max(0, targetCrop.x / dispW);
        const fracY = Math.max(0, targetCrop.y / dispH);
        const fracW = Math.min(1 - fracX, targetCrop.width / dispW);
        const fracH = Math.min(1 - fracY, targetCrop.height / dispH);

        const pdfCropX = originX + fracX * pageWidth;
        const pdfCropW = Math.max(10, fracW * pageWidth);
        const pdfCropH = Math.max(10, fracH * pageHeight);
        const pdfCropY = originY + (pageHeight - (fracY + fracH) * pageHeight);

        page.setMediaBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
        page.setCropBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
        page.setBleedBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
        page.setTrimBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
      });`;

crop = crop.replace(downloadLogicRegex, fixedDownloadLogic);
fs.writeFileSync("src/components/CropPdf.tsx", crop);

// ============================================================================
// 2. UPDATE FOOTER LIVE BUILD BADGE TIMESTAMP IN APP.TSX
// ============================================================================
let app = fs.readFileSync("src/App.tsx", "utf8");
const currentTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
app = app.replace(/Live Build:\s*[\d:]+\s*(?:AM|PM)?/gi, `Live Build: ${currentTime}`);
fs.writeFileSync("src/App.tsx", app);
console.log(`✓ Updated footer Live Build badge to ${currentTime}`);

// ============================================================================
// 3. RUN PRODUCTION BUILD
// ============================================================================
console.log("\nRunning npm run build...\n");
try {
  execSync("npm run build", { stdio: "inherit" });
  console.log("\n==========================================");
  console.log("✓ ZERO ERRORS — BUILD COMPLETE");
  console.log("==========================================");
} catch (err) {
  process.exit(1);
}
