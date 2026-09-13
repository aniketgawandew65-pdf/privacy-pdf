const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Reverting src/App.tsx to clean baseline...");
execSync("git checkout -- src/App.tsx", { stdio: "inherit" });

console.log("2. Reading clean src/App.tsx...");
let app = fs.readFileSync("src/App.tsx", "utf8");

// A. Add Zap to existing lucide-react import
app = app.replace(/(import\s*\{)([^}]+)(\}\s*from\s*['"]lucide-react['"])/, (match, p1, p2, p3) => {
  if (!p2.includes("Zap")) {
    return `${p1} Zap, ${p2}${p3}`;
  }
  return match;
});
console.log("✓ Added Zap icon to imports.");

// B. Ensure useState and useEffect are imported from 'react'
app = app.replace(/(import\s*(?:React\s*,?\s*)?\{)([^}]+)(\}\s*from\s*['"]react['"])/, (match, p1, p2, p3) => {
  let list = p2;
  if (!list.includes("useState")) list = "useState, " + list;
  if (!list.includes("useEffect")) list = "useEffect, " + list;
  return `${p1} ${list} ${p3}`;
});
console.log("✓ Verified React state imports.");

// C. Add the 10 capability headlines pool
const workflowPoolCode = `
const WORKFLOW_CAPABILITIES = [
  "Offline PDF Redaction & Sanitization",
  "In-Browser Word to Vector PDF",
  "Zero-Upload Client-Side Compression",
  "Air-Gapped Multi-Document Merge",
  "Private OCR & Document Text Extraction",
  "Client-Side Page Split & Reorganizer",
  "In-Memory PDF Crop & Deskew",
  "Bank Statement to Excel Converter",
  "Local PDF Password & Encryption Shield",
  "Zero-Server Booklet & N-Up Imposition"
];
`;

if (!app.includes("WORKFLOW_CAPABILITIES")) {
  app = app.replace(/(export\s+default\s+function\s+App|function\s+App\s*\(|const\s+App\s*=)/, `${workflowPoolCode}\n$1`);
  console.log("✓ Added workflow capability pool.");
}

// D. Add state hooks for shuffling and ?pro=true dev check
const hooksCode = `
  const isDevMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("pro") === "true";
  const [activeWorkflows, setActiveWorkflows] = useState<string[]>(() => {
    return [...WORKFLOW_CAPABILITIES].sort(() => 0.5 - Math.random()).slice(0, 6);
  });
  useEffect(() => {
    setActiveWorkflows([...WORKFLOW_CAPABILITIES].sort(() => 0.5 - Math.random()).slice(0, 6));
  }, []);
`;

if (!app.includes("isDevMode")) {
  app = app.replace(/(export\s+default\s+function\s+App[^{]*\{|function\s+App[^{]*\{|const\s+App\s*=\s*\([^)]*\)\s*=>\s*\{)/, `$1\n${hooksCode}`);
  console.log("✓ Added activeWorkflows and isDevMode state.");
}

// E. Sizing: Scale logo box and header typography to Medium
app = app.replace(
  /<h1[^>]*>1into1 PDF<\/h1>/,
  '<h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">1into1 PDF</h1>'
);
app = app.replace(
  /<p[^>]*>100%\s*In-Browser\s*Privacy\s*Suite<\/p>/,
  '<p className="text-sm sm:text-base font-medium text-zinc-400">100% In-Browser Privacy Suite</p>'
);
app = app.replace(
  /className="[^"]*?(?:w-[0-9]+)\s+(?:h-[0-9]+)[^"]*?"(?=[\s\S]{0,140}1into1 PDF)/,
  'className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center p-2 shrink-0 shadow-lg"'
);
console.log("✓ Scaled logo and brand title to medium.");

// F. Privacy Pill: Replace with Zap icon and exact text using index positioning
const pillIdx = app.search(/Turn off Wi-Fi to test|Zero uploads/);
if (pillIdx !== -1) {
  const openDiv = app.lastIndexOf("<div", pillIdx);
  const closeDiv = app.indexOf("</div>", pillIdx);
  if (openDiv !== -1 && closeDiv !== -1) {
    const originalPill = app.substring(openDiv, closeDiv + 6);
    const newPill = `<div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs font-medium text-emerald-400 shadow-sm">
            <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Lightning fast • No internet needed • 100% private • No signup</span>
          </div>`;
    app = app.replace(originalPill, newPill);
    console.log("✓ Replaced privacy pill badge with Zap icon.");
  }
}

// G. Popular Workflows: Replace the static compression items with dynamic shuffle pills
const pwIdx = app.indexOf("POPULAR WORKFLOWS");
if (pwIdx !== -1) {
  const c100Idx = app.indexOf("Compress to 100KB", pwIdx);
  if (c100Idx !== -1) {
    const itemsOpen = app.lastIndexOf("<div", c100Idx);
    const extractIdx = app.indexOf("Extract PDF for LLMs", c100Idx);
    if (extractIdx !== -1) {
      const itemsClose = app.indexOf("</div>", extractIdx);
      if (itemsOpen !== -1 && itemsClose !== -1) {
        const originalGrid = app.substring(itemsOpen, itemsClose + 6);
        const newGrid = `<div className="flex flex-wrap items-center justify-center gap-2 max-w-3xl mx-auto my-3">
          {activeWorkflows.map((item, idx) => (
            <span
              key={idx}
              className="px-3.5 py-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-300 font-medium hover:border-zinc-700 hover:text-white transition shadow-sm select-none cursor-default"
            >
              {item}
            </span>
          ))}
        </div>`;
        app = app.replace(originalGrid, newGrid);
        console.log("✓ Replaced workflow items with activeWorkflows map.");
      }
    }
  }
}

// H. Live Build: Gate display to ?pro=true
const lbIdx = app.indexOf("Live Build:");
if (lbIdx !== -1) {
  const pOpen = app.lastIndexOf("<p", lbIdx);
  const pClose = app.indexOf("</p>", lbIdx);
  if (pOpen !== -1 && pClose !== -1) {
    const originalP = app.substring(pOpen, pClose + 4);
    const currentTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    const newP = `{isDevMode && (
          <p className="text-[11px] font-mono text-zinc-600 flex items-center justify-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
            Live Build: ${currentTime}
          </p>
        )}`;
    app = app.replace(originalP, newP);
    console.log("✓ Gated Live Build visibility to isDevMode.");
  }
}

// Safety Assertion Checks
if (!app.includes("<Zap")) throw new Error("Assertion failed: Zap icon not placed.");
if (!app.includes("activeWorkflows.map")) throw new Error("Assertion failed: activeWorkflows not placed.");
if (!app.includes("{isDevMode &&")) throw new Error("Assertion failed: isDevMode not placed.");

fs.writeFileSync("src/App.tsx", app);

console.log("\n3. Running production build to verify zero errors...\n");
execSync("npm run build", { stdio: "inherit" });
console.log("\n==========================================");
console.log("✓ ZERO COMPILATION ERRORS — PHASE 1 COMPLETE");
console.log("==========================================");
