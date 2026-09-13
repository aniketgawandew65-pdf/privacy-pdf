const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Reading src/components/CropPdf.tsx...");
let code = fs.readFileSync("src/components/CropPdf.tsx", "utf8");

// Ensure pdfjsLib is imported
if (!code.includes("from 'pdfjs-dist'") && !code.includes('from "pdfjs-dist"')) {
  code = "import * as pdfjsLib from 'pdfjs-dist';\n" + code;
}

// Locate the try block containing PDFDocument.load
const startMarker = "const arrayBuffer = await file.arrayBuffer();";
const startIndex = code.indexOf(startMarker);
if (startIndex === -1) {
  console.error("❌ Could not find startMarker in src/components/CropPdf.tsx");
  process.exit(1);
}

// Locate the matching catch block
const catchIndex = code.indexOf("} catch", startIndex);
if (catchIndex === -1) {
  console.error("❌ Could not find '} catch' in src/components/CropPdf.tsx");
  process.exit(1);
}

console.log(`✓ Accurately mapped crop execution block.`);

// Universal Dual-Pipeline Crop Execution
const replacementBody = `const arrayBuffer = await file.arrayBuffer();
      let croppedPdfBytes: Uint8Array = new Uint8Array();

      // 1. Lossless Vector Pipeline for standard unencrypted documents
      let isEncrypted = false;
      try {
        const testDoc = await PDFDocument.load(arrayBuffer);
        const pages = testDoc.getPages();
        const canvasEl = canvasRef.current;
        const dispW = canvasEl ? (canvasEl.clientWidth || 600) : 600;
        const dispH = canvasEl ? (canvasEl.clientHeight || 800) : 800;

        pages.forEach((page, i) => {
          const pageIdx = i + 1;
          const targetCrop = (typeof applyToAll !== "undefined" && applyToAll)
            ? cropBox
            : ((typeof crops !== "undefined" && crops && (crops as any)[pageIdx])
                ? (crops as any)[pageIdx]
                : (pageIdx === (typeof currentPage !== "undefined" ? currentPage : 1) ? cropBox : null));

          if (!targetCrop) return;

          const mediaBox = page.getMediaBox();
          const originX = mediaBox.x || 0;
          const originY = mediaBox.y || 0;
          const pageWidth = mediaBox.width || page.getWidth();
          const pageHeight = mediaBox.height || page.getHeight();

          const fracX = Math.max(0, targetCrop.x / (dispW || 1));
          const fracY = Math.max(0, targetCrop.y / (dispH || 1));
          const fracW = Math.min(1 - fracX, targetCrop.width / (dispW || 1));
          const fracH = Math.min(1 - fracY, targetCrop.height / (dispH || 1));

          const pdfCropX = originX + fracX * pageWidth;
          const pdfCropW = Math.max(10, fracW * pageWidth);
          const pdfCropH = Math.max(10, fracH * pageHeight);
          const pdfCropY = originY + (pageHeight - (fracY + fracH) * pageHeight);

          page.setMediaBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
          page.setCropBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
          page.setBleedBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
          page.setTrimBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
        });

        croppedPdfBytes = await testDoc.save();
      } catch (loadErr: any) {
        // Document has permission/owner locks (government receipts, bank statements)
        isEncrypted = true;
      }

      // 2. High-Fidelity Decrypted Engine for encrypted receipts and statements
      if (isEncrypted) {
        const loadingTask = pdfjsLib.getDocument({
          data: new Uint8Array(arrayBuffer),
          stopAtErrors: false,
        });
        const pdfDoc = await loadingTask.promise;
        const numPages = pdfDoc.numPages;
        const outPdf = await PDFDocument.create();

        const canvasEl = canvasRef.current;
        const dispW = canvasEl ? (canvasEl.clientWidth || 600) : 600;
        const dispH = canvasEl ? (canvasEl.clientHeight || 800) : 800;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          const pageIdx = pageNum;
          const targetCrop = (typeof applyToAll !== "undefined" && applyToAll)
            ? cropBox
            : ((typeof crops !== "undefined" && crops && (crops as any)[pageIdx])
                ? (crops as any)[pageIdx]
                : (pageIdx === (typeof currentPage !== "undefined" ? currentPage : 1) ? cropBox : null));

          const page = await pdfDoc.getPage(pageNum);
          // Render at 2.0x for sharp, print-ready output
          const viewport = page.getViewport({ scale: 2.0 });

          const pageCanvas = document.createElement("canvas");
          pageCanvas.width = Math.floor(viewport.width);
          pageCanvas.height = Math.floor(viewport.height);
          const pCtx = pageCanvas.getContext("2d", { alpha: false });

          if (pCtx) {
            pCtx.fillStyle = "#ffffff";
            pCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
            await (page.render({ canvasContext: pCtx as any, viewport } as any) as any).promise;

            if (targetCrop) {
              const fracX = Math.max(0, targetCrop.x / (dispW || 1));
              const fracY = Math.max(0, targetCrop.y / (dispH || 1));
              const fracW = Math.min(1 - fracX, targetCrop.width / (dispW || 1));
              const fracH = Math.min(1 - fracY, targetCrop.height / (dispH || 1));

              const sx = Math.floor(fracX * pageCanvas.width);
              const sy = Math.floor(fracY * pageCanvas.height);
              const sw = Math.max(10, Math.floor(fracW * pageCanvas.width));
              const sh = Math.max(10, Math.floor(fracH * pageCanvas.height));

              const cropCanvas = document.createElement("canvas");
              cropCanvas.width = sw;
              cropCanvas.height = sh;
              const cCtx = cropCanvas.getContext("2d", { alpha: false });
              if (cCtx) {
                cCtx.fillStyle = "#ffffff";
                cCtx.fillRect(0, 0, sw, sh);
                cCtx.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

                const blob = await new Promise<Blob | null>((res) =>
                  cropCanvas.toBlob((b) => res(b), "image/jpeg", 0.95)
                );
                if (blob) {
                  const imgBytes = await blob.arrayBuffer();
                  const embedded = await outPdf.embedJpg(imgBytes);
                  const ptW = sw / 2;
                  const ptH = sh / 2;
                  const newPage = outPdf.addPage([ptW, ptH]);
                  newPage.drawImage(embedded, { x: 0, y: 0, width: ptW, height: ptH });
                }
              }
              cropCanvas.width = 0;
              cropCanvas.height = 0;
            } else {
              const blob = await new Promise<Blob | null>((res) =>
                pageCanvas.toBlob((b) => res(b), "image/jpeg", 0.92)
              );
              if (blob) {
                const imgBytes = await blob.arrayBuffer();
                const embedded = await outPdf.embedJpg(imgBytes);
                const ptW = viewport.width / 2;
                const ptH = viewport.height / 2;
                const newPage = outPdf.addPage([ptW, ptH]);
                newPage.drawImage(embedded, { x: 0, y: 0, width: ptW, height: ptH });
              }
            }
          }

          pageCanvas.width = 0;
          pageCanvas.height = 0;
          if (typeof (page as any).cleanup === "function") {
            (page as any).cleanup();
          }
        }

        croppedPdfBytes = await outPdf.save();
      }

      // 3. Programmatic File Download
      if (croppedPdfBytes && croppedPdfBytes.byteLength > 0) {
        const outBlob = new Blob([croppedPdfBytes], { type: "application/pdf" });
        const downloadUrl = URL.createObjectURL(outBlob);
        const fileName = (file.name.replace(/\\.pdf$/i, "") || "document") + "_cropped.pdf";

        const downloadLink = document.createElement("a");
        downloadLink.href = downloadUrl;
        downloadLink.download = fileName;
        downloadLink.style.display = "none";
        document.body.appendChild(downloadLink);
        downloadLink.click();

        setTimeout(() => {
          document.body.removeChild(downloadLink);
          URL.revokeObjectURL(downloadUrl);
        }, 2500);
      }
    `;

code = code.slice(0, startIndex) + replacementBody + code.slice(catchIndex);
fs.writeFileSync("src/components/CropPdf.tsx", code);
console.log("✓ src/components/CropPdf.tsx updated with dual-pipeline crop engine.");

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
console.log("✓ ZERO COMPILATION ERRORS — ENGINE COMPLETE");
console.log("==========================================");
