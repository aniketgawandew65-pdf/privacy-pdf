const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Restoring src/App.tsx to clean working state...");
execSync("git checkout -- src/App.tsx", { stdio: "inherit" });

console.log("2. Reading clean src/App.tsx...");
let app = fs.readFileSync("src/App.tsx", "utf8");

// A. Cleanly import Zap from lucide-react
const lucideRegex = /import\s*\{([\s\S]*?)\}\s*from\s*['"]lucide-react['"]/;
const lucideMatch = app.match(lucideRegex);
if (lucideMatch && !lucideMatch[1].includes("Zap")) {
  app = app.replace(lucideRegex, `import { Zap, ${lucideMatch[1].trim()} } from 'lucide-react'`);
  console.log("✓ Imported Zap icon.");
}

// B. Cleanly ensure useState and useEffect from react
const reactRegex = /import\s*React\s*,?\s*\{([\s\S]*?)\}\s*from\s*['"]react['"]/;
const reactMatch = app.match(reactRegex);
if (reactMatch) {
  let imports = reactMatch[1];
  if (!imports.includes("useState")) imports = "useState, " + imports.trim();
  if (!imports.includes("useEffect")) imports = "useEffect, " + imports.trim();
  app = app.replace(reactRegex, `import React, { ${imports} } from 'react'`);
}

// C. Insert WORKFLOW_CAPABILITIES pool
const workflowPool = `
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
  app = app.replace(/(export\s+default\s+function\s+App|function\s+App\s*\()/, `${workflowPool}\n$1`);
  console.log("✓ Added 10 workflow capability headlines.");
}

// D. Insert state hooks for shuffle and developer ?pro=true check
const stateCode = `
  const [activeWorkflows, setActiveWorkflows] = useState<string[]>(() => {
    return [...WORKFLOW_CAPABILITIES].sort(() => 0.5 - Math.random()).slice(0, 6);
  });
  const isDevMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("pro") === "true";

  useEffect(() => {
    const shuffled = [...WORKFLOW_CAPABILITIES].sort(() => 0.5 - Math.random()).slice(0, 6);
    setActiveWorkflows(shuffled);
  }, []);
`;

if (!app.includes("activeWorkflows")) {
  app = app.replace(/(function\s+App[^{]*\{|const\s+App[^=]*=\s*\(\)\s*=>\s*\{)/, `$1\n${stateCode}`);
  console.log("✓ Added shuffle and dev-mode state.");
}

// E. Sizing update: Medium Logo and Medium Brand Header
app = app.replace(/<h1[^>]*?>1into1 PDF<\/h1>/, '<h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">1into1 PDF</h1>');
app = app.replace(/<p[^>]*?>100%\s*In-Browser\s*Privacy\s*Suite<\/p>/, '<p className="text-sm font-medium text-zinc-400">100% In-Browser Privacy Suite</p>');

// Scale up logo box to medium (w-12 h-12)
app = app.replace(
  /className="[^"]*?(?:w-[89]|w-10)\s+(?:h-[89]|h-10)[^"]*?"(?=[\s\S]{0,120}1into1 PDF)/,
  'className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center p-2 shrink-0 shadow-lg"'
);
console.log("✓ Scaled logo and header typography to medium.");

// F. Privacy Pill update with Zap icon and exact text
app = app.replace(
  /(<div[^>]*?>\s*)(?:<[^>]+>\s*)*(?:Zero uploads[\s\S]*?100%\s*Private|Turn off Wi-Fi[\s\S]*?100%\s*Private)(\s*<\/div>)/i,
  `$1<Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Lightning fast • No internet needed • 100% private • No signup</span>$2`
);
console.log("✓ Updated privacy pill text and icon.");

// G. Popular Workflows: Balanced tag replacement
const pwIndex = app.indexOf("POPULAR WORKFLOWS");
if (pwIndex !== -1) {
  const openDivIdx = app.lastIndexOf("<div", pwIndex);
  let depth = 0;
  let closeDivIdx = -1;
  for (let i = openDivIdx; i < app.length; i++) {
    if (app.startsWith("<div", i)) {
      depth++;
    } else if (app.startsWith("</div>", i)) {
      depth--;
      if (depth === 0) {
        closeDivIdx = i + 6;
        break;
      }
    }
  }

  if (closeDivIdx !== -1) {
    const newWorkflowSection = `<div className="mt-12 pt-6 border-t border-zinc-800/60 text-center max-w-4xl mx-auto px-4">
        <p className="text-xs font-mono font-semibold tracking-wider text-zinc-500 uppercase mb-4">
          POPULAR WORKFLOWS:
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {activeWorkflows.map((item, idx) => (
            <span
              key={idx}
              className="px-3 py-1.5 rounded-xl bg-zinc-900/70 border border-zinc-800 text-xs text-zinc-300 font-medium hover:border-zinc-700 hover:text-white transition shadow-sm select-none cursor-default"
            >
              {item}
            </span>
          ))}
        </div>
      </div>`;
    app = app.substring(0, openDivIdx) + newWorkflowSection + app.substring(closeDivIdx);
    console.log("✓ Replaced popular workflows with 6 shuffling capabilities.");
  }
}

// H. Live Build: Visible ONLY when URL has ?pro=true
const currentTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
const lbIdx = app.indexOf("Live Build:");
if (lbIdx !== -1) {
  const openPIdx = app.lastIndexOf("<p", lbIdx);
  const closePIdx = app.indexOf("</p>", lbIdx);
  if (openPIdx !== -1 && closePIdx !== -1 && closePIdx > openPIdx) {
    const fullTag = app.substring(openPIdx, closePIdx + 4);
    app = app.replace(fullTag, `{isDevMode && (
          <p className="text-[11px] font-mono text-zinc-600 flex items-center justify-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
            Live Build: ${currentTime}
          </p>
        )}`);
    console.log("✓ Live Build gated strictly to ?pro=true.");
  }
}

fs.writeFileSync("src/App.tsx", app);

console.log("\nRunning production build to verify zero errors...\n");
execSync("npm run build", { stdio: "inherit" });
console.log("\n==========================================");
console.log("✓ ZERO COMPILATION ERRORS — BUILD VERIFIED");
console.log("==========================================");
