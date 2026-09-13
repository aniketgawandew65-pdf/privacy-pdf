const fs = require("fs");
const { execSync } = require("child_process");

console.log("Reading src/App.tsx...");
let app = fs.readFileSync("src/App.tsx", "utf8");

// Target the existing privacy badge button
const oldBadgeRegex = /<button\s+type="button"\s+onClick=\{\(\)\s*=>\s*setIsAuditDrawerOpen\(true\)\}[\s\S]*?<\/button>/;

const newBadge = `<button
          type="button"
          onClick={() => setIsAuditDrawerOpen(true)}
          className="inline-flex flex-col sm:flex-row items-center justify-center gap-x-4 gap-y-1 px-4 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] sm:text-xs font-medium text-emerald-400 mb-4 sm:mb-6 hover:bg-emerald-500/15 hover:border-emerald-500/30 transition cursor-pointer shadow-sm text-center"
          title="Click to inspect network telemetry"
        >
          <div className="flex items-center justify-center gap-2">
            <span className="inline-flex items-center gap-1"><Zap className="w-3 h-3 text-emerald-400 shrink-0" /> Lightning fast</span>
            <span className="text-emerald-600/60">•</span>
            <span>No internet needed</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span>100% private</span>
            <span className="text-emerald-600/60">•</span>
            <span>No signup</span>
          </div>
        </button>`;

if (oldBadgeRegex.test(app)) {
  app = app.replace(oldBadgeRegex, newBadge);
  fs.writeFileSync("src/App.tsx", app);
  console.log("✓ Privacy badge successfully updated to 2-up, 2-down layout.");
} else {
  console.error("Could not find exact badge pattern to replace.");
}

console.log("\nRunning production build to verify zero errors...\n");
execSync("npm run build", { stdio: "inherit" });
console.log("\n==========================================");
console.log("✓ ZERO COMPILATION ERRORS — BUILD SUCCESSFUL");
console.log("==========================================");
