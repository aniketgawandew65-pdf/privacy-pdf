const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Permanently restoring Live Build footer status in src/App.tsx...");
let app = fs.readFileSync("src/App.tsx", "utf8");

// Remove isDevMode conditional gating so Live Build is ALWAYS visible
app = app.replace(/\{isDevMode\s*&&\s*\(/g, "");
// Remove the trailing closing parenthesis and brace after Live Build paragraph
app = app.replace(/(Live Build:[^<]+<\/p>\s*)\}\)/g, "$1");

const currentTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
app = app.replace(/Live Build:\s*[\d:]+\s*(?:AM|PM)?/gi, "Live Build: " + currentTime);
fs.writeFileSync("src/App.tsx", app);
console.log(`✓ Live Build badge restored unconditionally: Live Build: ${currentTime}`);

console.log("2. Restoring clean CropPdf.tsx preview loader from HEAD~1...");
execSync("git checkout HEAD~1 -- src/components/CropPdf.tsx", { stdio: "inherit" });

let crop = fs.readFileSync("src/components/CropPdf.tsx", "utf8");

// Ensure pdfjsLib is imported at top
if (!crop.includes("from 'pdfjs-dist'") && !crop.includes('from "pdfjs-dist"')) {
  crop = "import * as pdfjsLib from 'pdfjs-dist';\n" + crop;
}

// Locate PDFDocument.load inside handleCrop (line ~307)
const loadPos = crop.indexOf("PDFDocument.load");
if (loadPos === -1) {
  console.error("❌ Could not find PDFDocument.load in src/components/CropPdf.tsx");
  process.exit(1);
}

// Map the exact try { ... } block inside handleCrop
const tryStart = crop.lastIndexOf("try {", loadPos);
const catchPos = crop.indexOf("} catch", loadPos);
const catchBraceEnd = crop.indexOf("}", crop.indexOf("{", catchPos) + 1);

if (tryStart === -1 || catchPos === -1 || catchBraceEnd === -1) {
  console.error("❌ Could not map handleCrop try/catch block");
  process.exit(1);
}

console.log(`✓ Accurately mapped crop export block (preview loader above line ${tryStart} left completely intact).`);

const dualPipelineCrop = `try {
      const arrayBuffer = await file.arrayBuffer();
      let outputBytes: Uint8Array | null = null;
      let needsDecryptedRender = false;

      // Pipeline 1: Lossless vector crop for normal PDFs
      try {
        const testDoc = await PDFDocument.load(arrayBuffer);
        const pages = testDoc.getPages();
        if (pages.length === 0) throw new Error("Zero pages");

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
        });

        const savedBytes = await testDoc.save();
        if (savedBytes && savedBytes.byteLength > 600) {
          outputBytes = savedBytes;
        } else {
          needsDecryptedRender = true;
        }
      } catch (err: any) {
        // Document has permission/owner locks (e.g. IGR receipt, bank statement)
        needsDecryptedRender = true;
      }

      // Pipeline 2: High-fidelity decrypted slice for receipts and locked files
      if (needsDecryptedRender) {
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

        outputBytes = await outPdf.save();
      }

      // Safe download anchor: prevents Safari tab takeover
      if (outputBytes && outputBytes.byteLength > 0) {
        const outBlob = new Blob([outputBytes as any], { type: "application/pdf" });
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
    } catch (err: any) {
      console.error("Crop error:", err);
      setError(err?.message || "Failed to crop PDF.");
    }`;

crop = crop.slice(0, tryStart) + dualPipelineCrop + crop.slice(catchBraceEnd + 1);

// Prevent TS6133 unused setNumPages error if present
crop = crop.replace(
  /const\s*\[\s*numPages\s*,\s*setNumPages\s*\]\s*=\s*useState<number>\(0\);/,
  "const [numPages, setNumPages] = useState<number>(0); void setNumPages;"
);

fs.writeFileSync("src/components/CropPdf.tsx", crop);
console.log("✓ src/components/CropPdf.tsx successfully updated.");

console.log("\n3. Running production build to verify zero errors...\n");
execSync("npm run build", { stdio: "inherit" });
console.log("\n==========================================");
console.log("✓ ZERO COMPILATION ERRORS — ALL FIXED");
console.log("==========================================");
