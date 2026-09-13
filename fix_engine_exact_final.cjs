const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Reading src/utils/pdfEngine.ts...");
let code = fs.readFileSync("src/utils/pdfEngine.ts", "utf8");

// Target the padding block right after outputBytes is saved
const searchTarget = "if (level === 'target') {";
const paddingIndex = code.indexOf(searchTarget, code.indexOf("Compressing page"));

if (paddingIndex === -1) {
  console.error("❌ Could not find target padding block in src/utils/pdfEngine.ts");
  process.exit(1);
}

// Find where this function returns outputBytes
const returnIndex = code.indexOf("return outputBytes;", paddingIndex);
if (returnIndex === -1) {
  console.error("❌ Could not find 'return outputBytes;'");
  process.exit(1);
}

const endCut = returnIndex + "return outputBytes;".length;

const exactPaddingReplacement = `if (level === 'target' && targetBytes && outputBytes.length < targetBytes) {
    const diff = targetBytes - outputBytes.length;
    if (diff > 0) {
      const padded = new Uint8Array(targetBytes);
      padded.set(outputBytes, 0);
      padded[outputBytes.length] = 0x0A; // newline
      padded[outputBytes.length + 1] = 0x25; // '%' comment marker
      for (let i = outputBytes.length + 2; i < targetBytes - 1; i++) {
        padded[i] = 0x20; // space
      }
      if (diff > 2) {
        padded[targetBytes - 1] = 0x0A; // newline
      }
      outputBytes = padded as any;
    }
  }

  return outputBytes;`;

code = code.slice(0, paddingIndex) + exactPaddingReplacement + code.slice(endCut);
fs.writeFileSync("src/utils/pdfEngine.ts", code);
console.log("✓ src/utils/pdfEngine.ts patched with byte-exact padding.");

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
