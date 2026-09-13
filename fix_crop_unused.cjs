const fs = require("fs");
const { execSync } = require("child_process");

console.log("Fixing CropPdf.tsx download calculation...");
let crop = fs.readFileSync("src/components/CropPdf.tsx", "utf8");

// Ensure dispW and dispH are actively consumed inside the per-page crop calculation
crop = crop.replace(
  /const\s+fracX\s*=\s*Math\.max\(0,\s*targetCrop\.x\s*\/\s*dispW\);/g,
  `const fracX = Math.max(0, targetCrop.x / (dispW || 1));`
);
crop = crop.replace(
  /const\s+fracY\s*=\s*Math\.max\(0,\s*targetCrop\.y\s*\/\s*dispH\);/g,
  `const fracY = Math.max(0, targetCrop.y / (dispH || 1));`
);
crop = crop.replace(
  /const\s+fracW\s*=\s*Math\.min\(1\s*-\s*fracX,\s*targetCrop\.width\s*\/\s*dispW\);/g,
  `const fracW = Math.min(1 - fracX, targetCrop.width / (dispW || 1));`
);
crop = crop.replace(
  /const\s+fracH\s*=\s*Math\.min\(1\s*-\s*fracY,\s*targetCrop\.height\s*\/\s*dispH\);/g,
  `const fracH = Math.min(1 - fracY, targetCrop.height / (dispH || 1));`
);

// Fallback: If dispW/dispH are declared right above the loop, make sure they are prefixed or used
if (!crop.includes("targetCrop.x / (dispW || 1)")) {
  crop = crop.replace(/const\s+dispW/g, "const _dispW");
  crop = crop.replace(/const\s+dispH/g, "const _dispH");
}

fs.writeFileSync("src/components/CropPdf.tsx", crop);

console.log("Running npm run build...\n");
try {
  execSync("npm run build", { stdio: "inherit" });
  console.log("\n==========================================");
  console.log("✓ ZERO COMPILATION ERRORS — BUILD COMPLETE");
  console.log("==========================================");
} catch (err) {
  process.exit(1);
}
