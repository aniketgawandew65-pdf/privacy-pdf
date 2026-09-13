const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Reading CropPdf.tsx...");
let crop = fs.readFileSync("src/components/CropPdf.tsx", "utf8");

// A. Ensure ZoomIn, ZoomOut, and RotateCcw are imported from lucide-react
const lucideMatch = crop.match(/import\s*\{([^}]+)\}\s*from\s*["\x27"]lucide-react["\x27"]/);
if (lucideMatch) {
  let icons = lucideMatch[1].split(',').map(s => s.trim());
  ['ZoomIn', 'ZoomOut', 'RotateCcw'].forEach(icon => {
    if (!icons.includes(icon)) icons.push(icon);
  });
  crop = crop.replace(lucideMatch[0], `import { ${icons.join(', ')} } from "lucide-react"`);
}

// B. Detect the zoom state variable (zoom or scale)
let zoomVar = "zoom";
let setZoomVar = "setZoom";
const zoomMatch = crop.match(/const\s*\[\s*([a-zA-Z0-9_]*zoom[a-zA-Z0-9_]*|[a-zA-Z0-9_]*scale[a-zA-Z0-9_]*)\s*,\s*([a-zA-Z0-9_]+)\s*\]\s*=\s*useState/i);
if (zoomMatch) {
  zoomVar = zoomMatch[1];
  setZoomVar = zoomMatch[2];
  console.log(`✓ Detected zoom state: ${zoomVar}, setter: ${setZoomVar}`);
}

// C. Locate and replace the magnifier + slider container
// Standard zoom bar: [ - | % | + | ↺ ]
const standardZoomControls = `
            {/* Standard Zoom Controls */}
            <div className="flex items-center gap-1 bg-zinc-900/90 border border-zinc-800 rounded-lg p-1">
              <button
                type="button"
                onClick={() => ${setZoomVar}((prev: number) => Math.max(0.5, Math.round((prev - 0.1) * 10) / 10))}
                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-mono px-1.5 text-zinc-300 min-w-[2.75rem] text-center select-none">
                {Math.round(${zoomVar} * 100)}%
              </span>
              <button
                type="button"
                onClick={() => ${setZoomVar}((prev: number) => Math.min(2.5, Math.round((prev + 0.1) * 10) / 10))}
                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => ${setZoomVar}(1.0)}
                className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
                title="Reset Zoom"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
`;

// Replace the slider input and its immediate magnifier wrapper
const rangeIdx = crop.indexOf('type="range"');
if (rangeIdx !== -1) {
  // Find start of the flex container wrapping the slider and icon
  const containerStart = crop.lastIndexOf("<div", rangeIdx);
  const containerEnd = crop.indexOf("</div>", rangeIdx) + 6;
  crop = crop.slice(0, containerStart) + standardZoomControls.trim() + crop.slice(containerEnd);
  console.log("✓ Magnifier slider replaced with standard zoom controls.");
} else {
  console.log("Slider not found; searching for zoom percentage display...");
  crop = crop.replace(/\{[^}]*zoom[^}]*x\}/g, `{Math.round(${zoomVar} * 100)}%`);
}

fs.writeFileSync("src/components/CropPdf.tsx", crop);

// D. Verify production build
console.log("\nVerifying production build with npm run build...\n");
try {
  execSync("npm run build", { stdio: "inherit" });
  console.log("\n==========================================");
  console.log("✓ ZERO COMPILATION ERRORS — BUILD SUCCESSFUL");
  console.log("==========================================");
} catch (err) {
  process.exit(1);
}
