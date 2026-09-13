const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Reverting src/App.tsx to clean state...");
execSync("git checkout -- src/App.tsx", { stdio: "inherit" });

console.log("2. Verifying clean build compiles...");
execSync("npm run build", { stdio: "inherit" });
console.log("✓ Baseline build passes.");

console.log("3. Reading src/App.tsx...");
let app = fs.readFileSync("src/App.tsx", "utf8");

// A. Clean standalone import for Zap icon (prevents import syntax errors)
if (!app.includes("Zap")) {
  app = "import { Zap } from 'lucide-react';\n" + app;
  console.log("✓ Added Zap icon import.");
}

// B. Define Capability Workflows Pool before App component
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
  app = app.replace(/(export\s+default\s+function\s+App|function\s+App\s*\()/, `${workflowPoolCode}\n$1`);
  console.log("✓ Added workflow capability headlines pool.");
}

// C. Add state hooks for random shuffling and developer ?pro=true check
const hookLogic = `
  const isDevMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("pro") === "true";
  const [activeWorkflows, setActiveWorkflows] = React.useState<string[]>(() => {
    return [...WORKFLOW_CAPABILITIES].sort(() => 0.5 - Math.random()).slice(0, 6);
  });
  React.useEffect(() => {
    setActiveWorkflows([...WORKFLOW_CAPABILITIES].sort(() => 0.5 - Math.random()).slice(0, 6));
  }, []);
`;

if (!app.includes("activeWorkflows")) {
  app = app.replace(/(function\s+App\s*\([^)]*\)\s*\{|const\s+App[^=]*=\s*\(\)\s*=>\s*\{)/, `$1\n${hookLogic}`);
  console.log("✓ Added workflow shuffling and ?pro=true developer state.");
}

// D. Sizing: Scale logo box, "1into1 PDF", and subtitle to Medium
app = app.replace(
  /<h1[^>]*?>1into1 PDF<\/h1>/,
  '<h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">1into1 PDF</h1>'
);
app = app.replace(
  /<p[^>]*?>100%\s*In-Browser\s*Privacy\s*Suite<\/p>/,
  '<p className="text-sm font-medium text-zinc-400">100% In-Browser Privacy Suite</p>'
);

// Scale logo container from w-8/9/10 to w-12 h-12
app = app.replace(
  /className="[^"]*?(?:w-[89]|w-10)\s+(?:h-[89]|h-10)[^"]*?"(?=[\s\S]{0,140}1into1 PDF)/,
  'className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center p-2 shrink-0 shadow-lg"'
);
console.log("✓ Scaled logo and brand title to medium.");

// E. Privacy Pill: Add Zap icon and exact requested text
app = app.replace(
  /(<div[^>]*?>\s*)(?:<[^>]+>\s*)*(?:Zero uploads[\s\S]*?100%\s*Private|Turn off Wi-Fi[\s\S]*?100%\s*Private)(\s*<\/div>)/i,
  `$1<Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Lightning fast • No internet needed • 100% private • No signup</span>$2`
);
console.log("✓ Updated privacy pill badge.");

// F. Popular Workflows: Replace the repeated compression items with 6 shuffling capability tags
const lines = app.split("\n");
let pwLineIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("POPULAR WORKFLOWS")) {
    pwLineIdx = i;
    break;
  }
}

if (pwLineIdx !== -1) {
  // Find where the workflow items end (before footer disclaimer or privacy policy)
  let endLineIdx = -1;
  for (let j = pwLineIdx + 1; j < lines.length; j++) {
    if (lines[j].includes("100% In-Browser") || lines[j].includes("Privacy Policy") || lines[j].includes("Terms of Service")) {
      endLineIdx = j;
      break;
    }
  }

  if (endLineIdx !== -1) {
    const replacement = [
      '        <p className="text-xs font-mono font-semibold tracking-wider text-zinc-500 uppercase mb-4">',
      '          POPULAR WORKFLOWS:',
      '        </p>',
      '        <div className="flex flex-wrap items-center justify-center gap-2 max-w-3xl mx-auto mb-8">',
      '          {activeWorkflows.map((item, idx) => (',
      '            <span',
      '              key={idx}',
      '              className="px-3.5 py-1.5 rounded-xl bg-zinc-900/80 border border-zinc-800 text-xs text-zinc-300 font-medium hover:border-zinc-700 hover:text-white transition shadow-sm select-none cursor-default"',
      '            >',
      '              {item}',
      '            </span>',
      '          ))}',
      '        </div>'
    ];

    lines.splice(pwLineIdx, endLineIdx - pwLineIdx, ...replacement);
    app = lines.join("\n");
    console.log("✓ Replaced popular workflows with 6 shuffling capability headlines.");
  }
}

// G. Developer-Gated Live Build (Visible ONLY when URL has ?pro=true)
const timeStr = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
const appLines = app.split("\n");
for (let i = 0; i < appLines.length; i++) {
  if (appLines[i].includes("Live Build:")) {
    const originalLine = appLines[i];
    appLines[i] = `        {isDevMode && (\n          ${originalLine.trim()}\n        )}`;
    break;
  }
}
app = appLines.join("\n");
// Update timestamp value
app = app.replace(/Live Build:\s*[\d:]+\s*(?:AM|PM)?/gi, "Live Build: " + timeStr);
console.log("✓ Gated Live Build timestamp strictly to ?pro=true.");

fs.writeFileSync("src/App.tsx", app);

console.log("\n4. Running production build to verify zero errors...\n");
execSync("npm run build", { stdio: "inherit" });
console.log("\n==========================================");
console.log("✓ ZERO COMPILATION ERRORS — PHASE 1 COMPLETE");
console.log("==========================================");
