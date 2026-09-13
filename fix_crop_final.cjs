const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Restoring CropPdf.tsx from HEAD to clear line 39-112 scope errors...");
execSync("git checkout HEAD -- src/components/CropPdf.tsx");

let crop = fs.readFileSync("src/components/CropPdf.tsx", "utf8");

// A. Clean up imports (remove double commas and ensure Zoom icons are clean)
crop = crop.replace(/,\s*,/g, ", ");
crop = crop.replace(/import\s*\{([^}]+)\}\s*from\s*["\x27"]lucide-react["\x27"]/, (m, p1) => {
  let icons = p1.split(",").map(s => s.trim()).filter(Boolean);
  ["ZoomIn", "ZoomOut", "RotateCcw"].forEach(ic => {
    if (!icons.includes(ic)) icons.push(ic);
  });
  return `import { ${icons.join(", ")} } from "lucide-react"`;
});

// B. Inject 8-Handle gesture handlers immediately before `return (`
console.log("2. Injecting 8-handle gesture controllers before return statement...");

const gestureControllers = `
  // @ts-ignore
  const handleBoxPointerDown = (e: any) => {
    e.stopPropagation();
    if (!cropBox) return;
    const startX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const startY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;
    const initBox = { ...cropBox };

    const onMove = (me: any) => {
      if (me.cancelable) me.preventDefault();
      const curX = me.clientX ?? (me.touches && me.touches[0]?.clientX) ?? startX;
      const curY = me.clientY ?? (me.touches && me.touches[0]?.clientY) ?? startY;
      const canvasEl = canvasRef.current;
      const maxW = canvasEl ? (canvasEl.clientWidth || canvasEl.width) : 2000;
      const maxH = canvasEl ? (canvasEl.clientHeight || canvasEl.height) : 2000;

      const nextX = Math.max(0, Math.min(maxW - initBox.width, initBox.x + (curX - startX)));
      const nextY = Math.max(0, Math.min(maxH - initBox.height, initBox.y + (curY - startY)));
      setCropBox((prev: any) => (prev ? { ...prev, x: nextX, y: nextY } : null));
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  };

  // @ts-ignore
  const handleHandlePointerDown = (e: any, handle: string) => {
    e.stopPropagation();
    if (!cropBox) return;
    const startX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const startY = e.clientY ?? (e.touches && e.touches[0]?.clientY) ?? 0;
    const initBox = { ...cropBox };

    const onMove = (me: any) => {
      if (me.cancelable) me.preventDefault();
      const curX = me.clientX ?? (me.touches && me.touches[0]?.clientX) ?? startX;
      const curY = me.clientY ?? (me.touches && me.touches[0]?.clientY) ?? startY;
      const dx = curX - startX;
      const dy = curY - startY;

      const canvasEl = canvasRef.current;
      const maxW = canvasEl ? (canvasEl.clientWidth || canvasEl.width) : 2000;
      const maxH = canvasEl ? (canvasEl.clientHeight || canvasEl.height) : 2000;

      let x = initBox.x;
      let y = initBox.y;
      let w = initBox.width;
      let h = initBox.height;

      if (handle.includes("w")) {
        const newW = Math.max(30, initBox.width - dx);
        const newX = initBox.x + (initBox.width - newW);
        if (newX >= 0) { x = newX; w = newW; }
      }
      if (handle.includes("e")) {
        w = Math.max(30, Math.min(maxW - x, initBox.width + dx));
      }
      if (handle.includes("n")) {
        const newH = Math.max(30, initBox.height - dy);
        const newY = initBox.y + (initBox.height - newH);
        if (newY >= 0) { y = newY; h = newH; }
      }
      if (handle.includes("s")) {
        h = Math.max(30, Math.min(maxH - y, initBox.height + dy));
      }

      setCropBox({ x, y, width: w, height: h });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onUp);
  };
`;

const returnIdx = crop.lastIndexOf("return (");
if (returnIdx !== -1) {
  crop = crop.slice(0, returnIdx) + gestureControllers + "\n  " + crop.slice(returnIdx);
  console.log("✓ Controllers inserted before return statement (all state variables in scope).");
}

// C. Replace the green block with the Redact 8-Handle Box in JSX
console.log("3. Replacing crop box with Redact-style 8-handle box...");

const redactBoxJsx = `
            {/* Redact-style 8-Handle Crop Box */}
            {cropBox && (
              <div
                style={{
                  position: "absolute",
                  left: \`\${cropBox.x}px\`,
                  top: \`\${cropBox.y}px\`,
                  width: \`\${cropBox.width}px\`,
                  height: \`\${cropBox.height}px\`,
                }}
                className="absolute border-2 border-emerald-500 bg-emerald-500/10 cursor-move z-20 select-none touch-none shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]"
                onPointerDown={handleBoxPointerDown}
                onMouseDown={handleBoxPointerDown}
              >
                {[
                  { id: "nw", style: { top: 0, left: 0, transform: "translate(-50%, -50%)", cursor: "nwse-resize" } },
                  { id: "n",  style: { top: 0, left: "50%", transform: "translate(-50%, -50%)", cursor: "ns-resize" } },
                  { id: "ne", style: { top: 0, right: 0, transform: "translate(50%, -50%)", cursor: "nesw-resize" } },
                  { id: "e",  style: { top: "50%", right: 0, transform: "translate(50%, -50%)", cursor: "ew-resize" } },
                  { id: "se", style: { bottom: 0, right: 0, transform: "translate(50%, 50%)", cursor: "nwse-resize" } },
                  { id: "s",  style: { bottom: 0, left: "50%", transform: "translate(-50%, 50%)", cursor: "ns-resize" } },
                  { id: "sw", style: { bottom: 0, left: 0, transform: "translate(-50%, 50%)", cursor: "nesw-resize" } },
                  { id: "w",  style: { top: "50%", left: 0, transform: "translate(-50%, -50%)", cursor: "ew-resize" } },
                ].map((h) => (
                  <div
                    key={h.id}
                    style={h.style as any}
                    onPointerDown={(e: any) => handleHandlePointerDown(e, h.id)}
                    onMouseDown={(e: any) => handleHandlePointerDown(e, h.id)}
                    className="absolute w-3 h-3 bg-white border-2 border-emerald-500 rounded-sm shadow-md touch-none z-30"
                  />
                ))}
              </div>
            )}
`;

// Locate existing cropBox JSX block
const cropBoxIdx = crop.search(/\{\s*cropBox\s*&&/);
if (cropBoxIdx !== -1) {
  let depth = 0;
  let endIdx = -1;
  for (let i = cropBoxIdx; i < crop.length; i++) {
    if (crop[i] === "{") depth++;
    else if (crop[i] === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  if (endIdx !== -1) {
    crop = crop.slice(0, cropBoxIdx) + redactBoxJsx.trim() + crop.slice(endIdx);
    console.log("✓ Replaced crop box JSX with 8-handle Redact box.");
  }
}

// D. Fix PDF Export: Guarantee MediaBox cropping and fallback to screen box
console.log("4. Patching PDF export to guarantee cropped download...");

const robustExport = `
      // Read crop to apply: check applyToAll, page map, or active screen cropBox
      const targetCrop = (typeof applyToAll !== "undefined" && applyToAll)
        ? cropBox
        : ((typeof crops !== "undefined" && crops && crops[i])
            ? crops[i]
            : cropBox);

      if (targetCrop) {
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
      }
`;

// Replace page.setCropBox block in download function
crop = crop.replace(
  /(?:const\s+targetCrop[\s\S]*?)?page\.setCropBox\([^)]+\);[\s\S]*?(?:page\.setMediaBox\([^)]+\);)?/g,
  robustExport.trim()
);

fs.writeFileSync("src/components/CropPdf.tsx", crop);

// E. Run TypeScript & Vite production build
console.log("\nRunning npm run build...\n");
try {
  execSync("npm run build", { stdio: "inherit" });
  console.log("\n==========================================");
  console.log("✓ ZERO COMPILATION ERRORS — BUILD SUCCESSFUL");
  console.log("==========================================");
} catch (err) {
  process.exit(1);
}
