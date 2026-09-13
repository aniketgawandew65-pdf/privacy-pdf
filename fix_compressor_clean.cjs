const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Reverting src/components/Compressor.tsx to clean baseline...");
execSync("git checkout -- src/components/Compressor.tsx", { stdio: "inherit" });

console.log("2. Reading clean Compressor.tsx...");
let code = fs.readFileSync("src/components/Compressor.tsx", "utf8");

// A. Dynamically detect the exact error state setter used in Compressor.tsx
let setterName = "setErrorMessage";
const lines = code.split("\n");
for (const line of lines) {
  if (line.includes("corrupted or password-locked")) {
    const match = line.match(/([a-zA-Z0-9_$]+)\s*\(/);
    if (match) {
      setterName = match[1];
      console.log(`✓ Detected existing error setter: ${setterName}`);
      break;
    }
  }
}

// B. Remove hard throws when file cannot be physically squeezed below the target
// Instead of throwing an error, deliver the smallest achievable output
code = code.replace(
  /if\s*\([^)]*>\s*targetSize[^)]*\)\s*\{\s*throw\s+new\s+Error\([^)]*\);?\s*\}/g,
  "/* Relaxed target constraint: deliver best possible reduction */"
);
code = code.replace(
  /throw\s+new\s+Error\(\s*['"][^'"]*unable to (?:reach|compress|achieve)[^'"]*['"]\s*\);?/gi,
  "/* Deliver best effort file */"
);
code = code.replace(
  /throw\s+new\s+Error\(\s*['"][^'"]*target size[^'"]*['"]\s*\);?/gi,
  "/* Deliver best effort file */"
);

// C. Safety Clamps: Prevent canvas collapse and negative JPEG quality
// When quality drops <= 0, browsers fail or revert to uncompressed defaults (0.92)
code = code.replace(
  /toDataURL\(\s*['"]image\/jpeg['"]\s*,\s*([^)]+)\)/g,
  (match, q) => `toDataURL('image/jpeg', Math.max(0.10, Math.min(0.85, ${q})))`
);
code = code.replace(
  /toBlob\(\s*([^,]+),\s*['"]image\/jpeg['"]\s*,\s*([^)]+)\)/g,
  (match, cb, q) => `toBlob(${cb}, 'image/jpeg', Math.max(0.10, Math.min(0.85, ${q})))`
);

// D. Replace the generic "corrupted or password-locked" catch handler using the detected setter
const oldCatchRegex = new RegExp(
  `${setterName}\\(\\s*['"][^'"]*corrupted or password-locked[^'"]*['"]\\s*\\);?`,
  "g"
);

const newCatchHandler = `const errStr = (err && (err.message || err.toString())) || "";
      if (errStr.toLowerCase().includes("password") || errStr.toLowerCase().includes("encrypted")) {
        ${setterName}("This PDF is password-protected. Please unlock it before compressing.");
      } else if (errStr.toLowerCase().includes("corrupt") || errStr.toLowerCase().includes("invalid pdf")) {
        ${setterName}("Failed to parse PDF. The document file structure may be damaged.");
      } else {
        ${setterName}(errStr || "Failed to compress PDF. Please try again.");
      }`;

if (oldCatchRegex.test(code)) {
  code = code.replace(oldCatchRegex, newCatchHandler);
  console.log(`✓ Updated catch handler using ${setterName}.`);
} else {
  // Fallback: replace any string containing "corrupted or password-locked"
  code = code.replace(
    /['"]Failed to compress PDF\. The document may be corrupted or password-locked\.['"]/g,
    `err?.message || "Failed to compress PDF. Please try again."`
  );
  console.log("✓ Updated error message string.");
}

fs.writeFileSync("src/components/Compressor.tsx", code);
console.log("✓ src/components/Compressor.tsx successfully updated.");

console.log("\n3. Running production build to verify zero errors...\n");
execSync("npm run build", { stdio: "inherit" });
console.log("\n==========================================");
console.log("✓ ZERO COMPILATION ERRORS — COMPRESSOR READY");
console.log("==========================================");
