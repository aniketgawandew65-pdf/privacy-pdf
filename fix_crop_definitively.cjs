const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Reverting CropPdf.tsx to clean HEAD state...");
execSync("git checkout HEAD -- src/components/CropPdf.tsx");

let crop = fs.readFileSync("src/components/CropPdf.tsx", "utf8");

// Clean imports: remove double commas and ensure Zoom icons are clean
crop = crop.replace(/,\s*,/g, ", ");
crop = crop.replace(/import\s*\{([^}]+)\}\s*from\s*["\x27"]lucide-react["\x27"]/, (m, p1) => {
  let icons = p1.split(",").map(s => s.trim()).filter(Boolean);
  ["ZoomIn", "ZoomOut", "RotateCcw"].forEach(ic => {
    if (!icons.includes(ic)) icons.push(ic);
  });
  return `import { ${icons.join(", ")} } from "lucide-react"`;
});

// Remove any prior getHandleClass or broken handler injections
crop = crop.replace(/const\s+getHandleClass[\s\S]*?\n\s*\};?/g, "");
crop = crop.replace(/\/\/\s*@ts-ignore[\s\S]*?handleHandlePointerDown[\s\S]*?\n\s*\};?/g, "");

// ============================================================================
// 2. DETECT OR DECLARE CROP BOX STATE
// ============================================================================
console.log("2. Ensuring cropBox state is declared at component root...");

// Check if cropBox is declared in useState
const hasCropBoxState = /const\s*\[\s*cropBox\s*,\s*setCropBox\s*\]\s*=/.test(crop);

if (!hasCropBoxState) {
  // Find where the first useState occurs and declare cropBox right beside it
  const firstStateMatch = crop.match(/const\s*\[[^\]]+\]\s*=\s*useState[^;]+;/);
  if (firstStateMatch) {
    const cropBoxDeclaration = `\n  const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number } | null>({ x: 40, y: 40, width: 280, height: 350 });`;
    crop = crop.replace(firstStateMatch[0], firstStateMatch[0] + cropBoxDeclaration);
    console.log("✓ Injected cropBox state at component root.");
  }
}

// ============================================================================
// 3. INJECT 8-HANDLE GESTURE HANDLERS (Move + 8-way Resize)
// ============================================================================
console.log("3. Injecting 8-handle Redact controllers...");

const redactHandlers = `
  // Redact-style 8-Handle Crop Controllers
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

// Insert the handlers right after cropBox is in scope
const cropBoxPos = crop.indexOf("setCropBox");
const nextSemi = crop.indexOf(";", cropBoxPos);
crop = crop.slice(0, nextSemi + 1) + redactHandlers + crop.slice(nextSemi + 1);

// ============================================================================
// 4. REPLACE BULKY CROP BOX WITH 8-HANDLE REDACT BOX IN JSX
// ============================================================================
console.log("4. Replacing crop box with translucent 8-handle Redact box in JSX...");

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

// Replace existing crop box JSX
const cropBoxMatch = crop.search(/\{\s*(?:cropBox|crop|activeCrop)\s*&&/);
if (cropBoxMatch !== -1) {
  let depth = 0;
  let endIdx = -1;
  for (let i = cropBoxMatch; i < crop.length; i++) {
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
    crop = crop.slice(0, cropBoxMatch) + redactBoxJsx.trim() + crop.slice(endIdx);
    console.log("✓ Replaced crop box JSX with 8-handle Redact box.");
  }
}

// ============================================================================
// 5. FIX PDF EXPORT: Enforce MediaBox Resizing & Bottom-Left Coordinate Inversion
// ============================================================================
console.log("5. Patching PDF export to guarantee cropped download...");

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

crop = crop.replace(
  /(?:const\s+targetCrop[\s\S]*?)?page\.setCropBox\([^)]+\);[\s\S]*?(?:page\.setMediaBox\([^)]+\);)?/g,
  robustExport.trim()
);

fs.writeFileSync("src/components/CropPdf.tsx", crop);

// ============================================================================
// 6. RUN VERIFICATION BUILD
// ============================================================================
console.log("\nRunning npm run build...\n");
try {
  execSync("npm run build", { stdio: "inherit" });
  console.log("\n==========================================");
  console.log("✓ ZERO COMPILATION ERRORS — BUILD 100% SUCCESSFUL");
  console.log("==========================================");
} catch (err) {
  process.exit(1);
}
