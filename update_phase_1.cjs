const fs = require("fs");
const { execSync } = require("child_process");

console.log("Applying Phase 1 UI updates to App.tsx...");

let app = fs.readFileSync("src/App.tsx", "utf8");

// 1. Ensure Zap icon is imported from lucide-react
if (!app.includes("Zap") && app.includes("lucide-react")) {
  app = app.replace(/from\s+["']lucide-react["']/, (match) => match);
  app = app.replace(/(import\s*{[^}]*)(}\s*from\s*["']lucide-react["'])/, "$1, Zap $2");
}

// 2. Add Workflow list and shuffling state if not already present
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
  // Insert before component definition
  app = app.replace(/export\s+default\s+function\s+App/, `${workflowPoolCode}\nexport default function App`);
  if (!app.includes("WORKFLOW_CAPABILITIES")) {
    app = app.replace(/function\s+App\s*\(/, `${workflowPoolCode}\nfunction App(`);
  }
}

// 3. Add shuffling effect and dev check inside App component
const devCheckCode = `
  const [activeWorkflows, setActiveWorkflows] = useState<string[]>([]);
  const isDevMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("pro") === "true";

  useEffect(() => {
    const shuffled = [...WORKFLOW_CAPABILITIES].sort(() => 0.5 - Math.random()).slice(0, 6);
    setActiveWorkflows(shuffled);
  }, []);
`;

if (!app.includes("activeWorkflows")) {
  app = app.replace(/(function\s+App[^{]*\{|const\s+App[^=]*=\s*\(\)\s*=>\s*\{)/, `$1\n${devCheckCode}`);
}

// 4. Update Header Logo & Typography to "Medium"
// Replace the top logo block (typically w-8/w-9/w-10 container)
app = app.replace(
  /<div className="w-9 h-9[^"]*"([\s\S]*?)<\/h1>/,
  `<div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700/80 flex items-center justify-center shadow-lg p-2 shrink-0">
              <img src="/logo.png" alt="1into1 Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">1into1 PDF</h1>
              <p className="text-sm font-medium text-zinc-400">100% In-Browser Privacy Suite</p>
            </div>`
);

// Fallback regex if previous logo container had different classes
app = app.replace(
  /<div className="w-8 h-8[^"]*"([\s\S]*?)<\/h1>/,
  `<div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700/80 flex items-center justify-center shadow-lg p-2 shrink-0">
              <img src="/logo.png" alt="1into1 Logo" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">1into1 PDF</h1>
              <p className="text-sm font-medium text-zinc-400">100% In-Browser Privacy Suite</p>
            </div>`
);

// 5. Update the "Zero uploads" badge text & icon
const oldBadgeRegex = /<div className="[^"]*border-emerald-500\/20[^"]*">[\s\S]*?Turn off Wi-Fi[\s\S]*?<\/div>/i;
const newBadge = `<div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs font-medium text-emerald-400 shadow-sm">
            <Zap className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Lightning fast • No internet needed • 100% private • No signup</span>
          </div>`;

if (oldBadgeRegex.test(app)) {
  app = app.replace(oldBadgeRegex, newBadge);
} else {
  // Generic text replacement fallback
  app = app.replace(/Zero uploads\s*•\s*Turn off Wi-Fi to test\s*•\s*100%\s*Private/gi, "Lightning fast • No internet needed • 100% private • No signup");
}

// 6. Replace Popular Workflows section with shuffling grid
const workflowsRegex = /<div[^>]*>\s*<h[234][^>]*>POPULAR WORKFLOWS:[\s\S]*?<\/div>\s*<\/div>/i;
const newWorkflowsMarkup = `<div className="mt-16 pt-8 border-t border-zinc-800/80 text-center max-w-4xl mx-auto px-4">
        <h3 className="text-xs font-mono font-semibold tracking-wider text-zinc-500 uppercase mb-4">
          POPULAR WORKFLOWS
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {(activeWorkflows.length > 0 ? activeWorkflows : WORKFLOW_CAPABILITIES.slice(0, 6)).map((item, idx) => (
            <div
              key={idx}
              className="px-3.5 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs text-zinc-300 font-medium text-center hover:border-zinc-700 hover:text-white transition-all cursor-default select-none shadow-sm"
            >
              {item}
            </div>
          ))}
        </div>
      </div>`;

if (workflowsRegex.test(app)) {
  app = app.replace(workflowsRegex, newWorkflowsMarkup);
} else {
  // Fallback: replace any section containing POPULAR WORKFLOWS
  app = app.replace(/POPULAR WORKFLOWS:[\s\S]*?(?=<div className="mt-8|<footer|<\/footer)/i, (match) => {
    return `POPULAR WORKFLOWS\n        </h3>\n        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 my-4">\n          {(activeWorkflows.length > 0 ? activeWorkflows : WORKFLOW_CAPABILITIES.slice(0, 6)).map((item, idx) => (\n            <div key={idx} className="px-3.5 py-2 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs text-zinc-300 font-medium text-center">\n              {item}\n            </div>\n          ))}\n        </div>\n      `;
  });
}

// 7. Make Live Build timestamp visible ONLY when URL contains ?pro=true
const currentTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
app = app.replace(
  /(<span[^>]*class(?:Name)?="[^"]*text-emerald-500[^"]*"[^>]*>•<\/span>\s*Live Build:[\s\S]*?<\/p>)/gi,
  `{isDevMode && (
          <p className="text-[11px] font-mono text-zinc-600 flex items-center justify-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
            Live Build: ${currentTime}
          </p>
        )}`
);

fs.writeFileSync("src/App.tsx", app);
console.log("✓ src/App.tsx updated.");

console.log("\nRunning production build to verify zero errors...\n");
execSync("npm run build", { stdio: "inherit" });
console.log("\n==========================================");
console.log("✓ ZERO COMPILATION ERRORS — PHASE 1 COMPLETE");
console.log("==========================================");
