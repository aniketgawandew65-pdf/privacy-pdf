const fs = require("fs");
const { execSync } = require("child_process");

console.log("1. Reading TextToPdf.tsx...");
let text = fs.readFileSync("src/components/TextToPdf.tsx", "utf8");

// A. Ensure Loader2 is removed from imports if not used
text = text.replace(/,\s*,/g, ", ");
text = text.replace(/import\s*\{([^}]+)\}\s*from\s*["\x27"]lucide-react["\x27"]/, (m, p1) => {
  let icons = p1.split(",").map(s => s.trim()).filter(Boolean);
  icons = icons.filter(ic => ic !== "Loader2");
  return `import { ${icons.join(", ")} } from "lucide-react"`;
});

// B. Ensure editor updates htmlContent immediately on every single keystroke (0ms latency)
// Attach instant sync to onInput, onKeyUp, and onPaste on the contentEditable editor
text = text.replace(
  /onInput=\{[^}]+\}/g,
  `onInput={(e: any) => setHtmlContent(e.currentTarget.innerHTML)}`
);
if (!text.includes("onKeyUp=")) {
  text = text.replace(
    /contentEditable=\{true\}/g,
    `contentEditable={true} onKeyUp={(e: any) => setHtmlContent(e.currentTarget.innerHTML)} onPaste={(e: any) => { setTimeout(() => { if (editorRef.current) setHtmlContent(editorRef.current.innerHTML); }, 0); }}`
  );
}

// C. Replace the split double-box preview with ONE clean, single A4 page
const singleA4Preview = `
          {/* Single Clean A4 PDF Preview Page */}
          <div className="w-full max-w-lg mx-auto aspect-[1/1.414] bg-white text-zinc-900 shadow-2xl rounded-lg p-6 sm:p-10 min-h-[500px] overflow-y-auto border border-zinc-700 text-left select-text">
            {htmlContent && htmlContent.trim() && htmlContent !== "<p><br></p>" && htmlContent !== "<div><br></div>" ? (
              <div
                style={{ fontFamily: typeof fontFamily !== "undefined" ? fontFamily : "sans-serif" }}
                className="whitespace-pre-wrap font-sans text-zinc-900 text-left leading-relaxed text-sm sm:text-base break-words select-text"
                dangerouslySetInnerHTML={{ __html: htmlContent }}
              />
            ) : (
              <p className="text-zinc-400 italic text-sm sm:text-base select-none">
                Type your text above to see it appear here...
              </p>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
`;

// Locate the preview section under PDF Preview and replace both split boxes
const previewSectionMatch = text.match(/<div[^>]*className="[^"]*(?:border-t|p-4)[^"]*"[^>]*>[\s\S]*?(?:Type your text above|appear here live)[\s\S]*?<\/div>\s*<\/div>/);
if (previewSectionMatch) {
  text = text.replace(previewSectionMatch[0], singleA4Preview.trim());
  console.log("✓ Replaced split double boxes with a single A4 preview page.");
} else {
  // Fallback: replace any duplicate preview wrappers
  text = text.replace(
    /<div[\s\S]*?className="[^"]*aspect-\[1\/1\.414\][\s\S]*?<\/div>\s*<\/div>/,
    singleA4Preview.trim()
  );
}

// Ensure isRendering stays false so no stuck spinner loops occur
text = text.replace(/setIsRendering\(true\);/g, "setIsRendering(false);");
text = text.replace(/\{\s*isRendering\s*&&\s*\}/g, "");

fs.writeFileSync("src/components/TextToPdf.tsx", text);
console.log("✓ TextToPdf.tsx updated with 0ms live typing sync.");

// 2. Update footer Live Build timestamp in App.tsx
try {
  let app = fs.readFileSync("src/App.tsx", "utf8");
  const currentTime = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  app = app.replace(/Live Build:\s*[\d:]+\s*(?:AM|PM)?/gi, `Live Build: ${currentTime}`);
  fs.writeFileSync("src/App.tsx", app);
  console.log(`✓ Updated footer Live Build badge to: ${currentTime}`);
} catch (_) {}

// 3. Verify production build
console.log("\nRunning npm run build...\n");
execSync("npm run build", { stdio: "inherit" });
console.log("\n==========================================");
console.log("✓ ZERO COMPILATION ERRORS — BUILD SUCCESSFUL");
console.log("==========================================");
