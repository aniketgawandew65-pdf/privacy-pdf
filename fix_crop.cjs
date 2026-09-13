const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Cleaning untracked temp files...");
execSync("rm -f apply_fix.cjs apply_fix.js fix_all.cjs run_fix.cjs update_tools.cjs apply_final.cjs");

console.log("2. Patching CropPdf.tsx with Sign/Watermark locked box model...");
let crop = fs.readFileSync("src/components/CropPdf.tsx", "utf8");

// A. Ensure useEffect is imported
if (!crop.includes("useEffect")) {
  crop = crop.replace(/import\s*\{([^}]+)\}\s*from\s*["\x27"]react["\x27"]/, 'import { $1, useEffect } from "react"');
}

// B. Index-based replacement on containerRef to guarantee zero-slip viewport
const refIdx = crop.indexOf("ref={containerRef}");
if (refIdx !== -1) {
  const tagStart = crop.lastIndexOf("<", refIdx);
  const tagEnd = crop.indexOf(">", refIdx);
  let tag = crop.slice(tagStart, tagEnd + 1);
  tag = tag.replace(/\s*style=\{\{[^}]*\}\}/g, "");
  tag = tag.replace(
    "ref={containerRef}",
    'ref={containerRef} style={{ overflow: mode === "crop" ? "hidden" : "auto", touchAction: mode === "crop" ? "none" : "pan-x pan-y", overscrollBehavior: "none" }}'
  );
  crop = crop.slice(0, tagStart) + tag + crop.slice(tagEnd + 1);
  console.log("✓ Dynamic overflow/touch lock injected into containerRef tag.");
} else {
  console.error("ERROR: containerRef not found in JSX!");
  process.exit(1);
}

// C. Hardware-level non-passive touch blocker (stops Safari momentum scroll)
if (!crop.includes("blockNativeTouchScroll")) {
  const modeMatch = crop.match(/const\s*\[\s*mode\s*,\s*setMode\s*\]\s*=[^;]+;/);
  if (modeMatch) {
    const lockHook = [
      '',
      '  // Viewport freeze: PDF document NEVER moves while in Crop mode',
      '  useEffect(() => {',
      '    const el = containerRef.current;',
      '    if (!el) return;',
      '    const blockNativeTouchScroll = (e: TouchEvent) => {',
      '      if (mode === "crop") {',
      '        if (e.cancelable) e.preventDefault();',
      '        e.stopPropagation();',
      '      }',
      '    };',
      '    el.addEventListener("touchstart", blockNativeTouchScroll, { passive: false });',
      '    el.addEventListener("touchmove", blockNativeTouchScroll, { passive: false });',
      '    return () => {',
      '      el.removeEventListener("touchstart", blockNativeTouchScroll);',
      '      el.removeEventListener("touchmove", blockNativeTouchScroll);',
      '    };',
      '  }, [mode]);'
    ].join('\n');
    crop = crop.replace(modeMatch[0], modeMatch[0] + lockHook);
    console.log("✓ Non-passive touch blocker attached to containerRef.");
  }
}

// D. Lock all pan action starters strictly to Pan mode
crop = crop.replace(
  /const\s+(handlePanStart|startPan|onPanStart|handleMouseDownPan|handleStartPan)\s*=\s*\(([^)]*)\)\s*=>\s*\{/g,
  'const $1 = ($2: any) => {\n    if (mode !== "pan") return;'
);
crop = crop.replace(/setIsPanning\(\s*true\s*\);/g, 'if (mode === "pan") { setIsPanning(true); }');

// E. Ensure canvas element ignores pointer events
crop = crop.replace(
  /<canvas\s+([^>]*?ref=\{canvasRef\}[^>]*?)\/>/g,
  (match, attrs) => {
    if (!attrs.includes("pointer-events-none")) {
      return `<canvas ${attrs} className="pointer-events-none" />`;
    }
    return match;
  }
);

fs.writeFileSync("src/components/CropPdf.tsx", crop);

// F. Verify that git actually sees the file as modified
const diff = execSync("git diff --stat src/components/CropPdf.tsx", { encoding: "utf8" });
if (!diff.trim()) {
  console.error("ERROR: git diff is empty! The file was not modified.");
  process.exit(1);
}
console.log("✓ Git detected file modifications:\n" + diff);

// G. Run TypeScript & Vite production build
console.log("\nRunning npm run build...\n");
try {
  execSync("npm run build", { stdio: "inherit" });
  console.log("\n==========================================");
  console.log("✓ ZERO ERRORS — CROP LOCK BUILD COMPLETE");
  console.log("==========================================");
} catch (err) {
  process.exit(1);
}
