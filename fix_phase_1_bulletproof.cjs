const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Restoring src/App.tsx to clean baseline...");
execSync("git checkout -- src/App.tsx", { stdio: "inherit" });

console.log("2. Applying targeted AST-safe replacements...");
let app = fs.readFileSync("src/App.tsx", "utf8");

// A. Add the 10 capability headlines pool
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
}

// B. Add state hooks using React.* to bypass import requirements entirely
const hooksCode = `
  const isDevMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("pro") === "true";
  const [activeWorkflows, setActiveWorkflows] = React.useState<string[]>(() => {
    return [...WORKFLOW_CAPABILITIES].sort(() => 0.5 - Math.random()).slice(0, 6);
  });
  React.useEffect(() => {
    setActiveWorkflows([...WORKFLOW_CAPABILITIES].sort(() => 0.5 - Math.random()).slice(0, 6));
  }, []);
`;

if (!app.includes("isDevMode")) {
  app = app.replace(/(export\s+default\s+function\s+App[^{]*\{|function\s+App[^{]*\{|const\s+App\s*=\s*\([^)]*\)\s*=>\s*\{)/, `$1\n${hooksCode}`);
}

// C. Sizing: Scale logo box and header typography to Medium
app = app.replace(
  /<h1[^>]*>1into1 PDF<\/h1>/,
  '<h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">1into1 PDF</h1>'
);
app = app.replace(
  /<p[^>]*>100%\s*In-Browser\s*Privacy\s*Suite<\/p>/,
  '<p className="text-sm sm:text-base font-medium text-zinc-400">100% In-Browser Privacy Suite</p>'
);

const imgIdx = app.indexOf('src="/logo.png"');
if (imgIdx !== -1) {
  const divStart = app.lastIndexOf("<div", imgIdx);
  const classStart = app.indexOf('className="', divStart) + 11;
  const classEnd = app.indexOf('"', classStart);
  const originalClass = app.substring(classStart, classEnd);
  app = app.replace(originalClass, 'w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center p-2 shrink-0 shadow-lg');
}

// D. Privacy Pill: Replace with premium inline SVG and exact text
const pillStartIdx = app.search(/Turn off Wi-Fi to test|Zero uploads/);
if (pillStartIdx !== -1) {
  const divStart = app.lastIndexOf("<div", pillStartIdx);
  const divEnd = app.indexOf("</div>", pillStartIdx) + 6;
  const originalPill = app.substring(divStart, divEnd);
  
  const premiumZapSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400 shrink-0"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`;
  const newPill = `<div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs font-medium text-emerald-400 shadow-sm">
            ${premiumZapSvg}
            <span>Lightning fast • No internet needed • 100% private • No signup</span>
          </div>`;
          
  app = app.replace(originalPill, newPill);
}

// E. Popular Workflows: Replace the static items with dynamic shuffle pills
const pwIdx = app.indexOf("POPULAR WORKFLOWS");
if (pwIdx !== -1) {
  const gridStartIdx = app.indexOf("<div", pwIdx);
  const extractPdfIdx = app.indexOf("Extract PDF for LLMs", gridStartIdx);
  
  if (gridStartIdx !== -1 && extractPdfIdx !== -1) {
    const gridEndIdx = app.indexOf("</div>", extractPdfIdx) + 6;
    const originalGrid = app.substring(gridStartIdx, gridEndIdx);
    
    const newGrid = `<div className="flex flex-wrap items-center justify-center gap-2 max-w-3xl mx-auto my-5">
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
  }
}

// F. Live Build: Gate display to ?pro=true
const buildIdx = app.indexOf("Live Build:");
if (buildIdx !== -1) {
  const pStart = app.lastIndexOf("<p", buildIdx);
  const pEnd = app.indexOf("</p>", buildIdx) + 4;
  const originalP = app.substring(pStart, pEnd);
  
  const timeStr = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const newP = `{isDevMode && (
          <p className="text-[11px] font-mono text-zinc-600 flex items-center justify-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
            Live Build: ${timeStr}
          </p>
        )}`;
        
  app = app.replace(originalP, newP);
}

fs.writeFileSync("src/App.tsx", app);
console.log("✓ src/App.tsx updated perfectly.");

console.log("\n3. Running production build to verify zero errors...\n");
execSync("npm run build", { stdio: "inherit" });
console.log("\n==========================================");
console.log("✓ ZERO COMPILATION ERRORS — PHASE 1 COMPLETE");
console.log("==========================================");
