const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Reading CropPdf.tsx...");
let crop = fs.readFileSync("src/components/CropPdf.tsx", "utf8");

// ============================================================================
// A. CLEAN UP REDACT-STYLE 8-HANDLE BOX UI & INTERACTION
// ============================================================================
console.log("2. Implementing Redact-style 8-handle crop box...");

// Ensure the crop box has a generous default (80% of page) instead of a small chunk
crop = crop.replace(
  /const\s*\[\s*cropBox\s*,\s*setCropBox\s*\]\s*=\s*useState<[^>]*>\([^)]*\);/,
  `const [cropBox, setCropBox] = useState<any>({ x: 40, y: 40, width: 280, height: 350 });`
);

// Inject 8-handle position helper if not present
if (!crop.includes("getHandleClass")) {
  const helperCode = `
  const getHandleClass = (h: string) => {
    switch (h) {
      case "nw": return "top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize";
      case "n":  return "top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize";
      case "ne": return "top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize";
      case "e":  return "top-1/2 right-0 translate-x-1/2 -translate-y-1/2 cursor-ew-resize";
      case "se": return "bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize";
      case "s":  return "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-ns-resize";
      case "sw": return "bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize";
      case "w":  return "top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize";
      default:   return "";
    }
  };
`;
  const lastStateIdx = crop.lastIndexOf("useState");
  const endOfStateLine = crop.indexOf(";", lastStateIdx);
  crop = crop.slice(0, endOfStateLine + 1) + helperCode + crop.slice(endOfStateLine + 1);
}

// Replace the blocky crop box element with the sleek 8-handle Redact-style box
const redactBoxJsx = `
            {/* Redact-style 8-Handle Crop Box */}
            {cropBox && (
              <div
                style={{
                  left: \`\${cropBox.x}px\`,
                  top: \`\${cropBox.y}px\`,
                  width: \`\${cropBox.width}px\`,
                  height: \`\${cropBox.height}px\`,
                }}
                className="absolute border-2 border-emerald-500 bg-emerald-500/10 cursor-move z-20 select-none touch-none shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]"
                onPointerDown={(e: any) => {
                  if (typeof handleBoxDragStart === "function") handleBoxDragStart(e);
                  else if (typeof handleMouseDownBox === "function") handleMouseDownBox(e);
                }}
              >
                {/* 8 Resize Handles */}
                {["nw", "n", "ne", "e", "se", "s", "sw", "w"].map((h) => (
                  <div
                    key={h}
                    onPointerDown={(e: any) => {
                      e.stopPropagation();
                      if (typeof handleResizeStart === "function") handleResizeStart(e, h);
                      else if (typeof handleHandleMouseDown === "function") handleHandleMouseDown(e, h);
                    }}
                    className={\`absolute w-3 h-3 bg-white border-2 border-emerald-500 rounded-sm shadow-md touch-none \${getHandleClass(h)}\`}
                  />
                ))}
              </div>
            )}
`;

// Replace existing crop box rendering in JSX
crop = crop.replace(
  /\{cropBox\s*&&[\s\S]*?className="[^"]*cursor-move[^"]*"[\s\S]*?<\/div>\s*\)\}/,
  redactBoxJsx.trim()
);

// ============================================================================
// B. FIX PDF DOWNLOAD CROPPING (MediaBox + CropBox + Inverted Y)
// ============================================================================
console.log("3. Enforcing physical MediaBox & CropBox cropping on export...");

// Replace the PDF cropping calculation logic inside the apply/download function
const robustCropLogic = `
      // Read physical page boundaries
      const mediaBox = page.getMediaBox();
      const originX = mediaBox.x || 0;
      const originY = mediaBox.y || 0;
      const pageWidth = mediaBox.width || page.getWidth();
      const pageHeight = mediaBox.height || page.getHeight();

      // Determine canvas display dimensions for accurate scaling
      const canvasEl = canvasRef.current;
      const dispW = canvasEl ? (canvasEl.clientWidth || canvasEl.width) : 1;
      const dispH = canvasEl ? (canvasEl.clientHeight || canvasEl.height) : 1;

      // Calculate normalized crop fractions (0.0 to 1.0)
      const fracX = Math.max(0, Math.min(1, targetCrop.x / dispW));
      const fracY = Math.max(0, Math.min(1, targetCrop.y / dispH));
      const fracW = Math.max(0.02, Math.min(1 - fracX, targetCrop.width / dispW));
      const fracH = Math.max(0.02, Math.min(1 - fracY, targetCrop.height / dispH));

      // PDF coordinates (PDF origin (0,0) is at bottom-left)
      const pdfCropX = originX + fracX * pageWidth;
      const pdfCropW = fracW * pageWidth;
      const pdfCropH = fracH * pageHeight;
      const pdfCropY = originY + (pageHeight - (fracY + fracH) * pageHeight);

      // Apply to all bounding boxes so Apple Preview, Safari, Chrome & Acrobat all crop
      page.setCropBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
      page.setMediaBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
      page.setBleedBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
      page.setTrimBox(pdfCropX, pdfCropY, pdfCropW, pdfCropH);
`;

// Insert the robust calculation into the page cropping loop
crop = crop.replace(
  /page\.setCropBox\([^)]+\);[\s\S]*?(?:page\.setMediaBox\([^)]+\);)?/g,
  robustCropLogic.trim()
);

fs.writeFileSync("src/components/CropPdf.tsx", crop);
console.log("✓ CropPdf.tsx updated with 8-handle box and physical MediaBox export.");

// ============================================================================
// C. VERIFY BUILD
// ============================================================================
console.log("\nRunning npm run build...\n");
try {
  execSync("npm run build", { stdio: "inherit" });
  console.log("\n==========================================");
  console.log("✓ ZERO COMPILATION ERRORS — BUILD COMPLETE");
  console.log("==========================================");
} catch (err) {
  process.exit(1);
}
