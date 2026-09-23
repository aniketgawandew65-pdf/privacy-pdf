// Local-only development engine QA. Usage: PLAYWRIGHT_MODULE=/path/to/index.mjs node tests/pdf-to-powerpoint-browser.mjs INPUT.pdf OUTPUT.pptx [mode] [pages]
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const [input, output, mode = "auto", pages = ""] = process.argv.slice(2);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
});
try {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  console.log("Browser started");
  const network = [];
  page.on("request", (r) => {
    network.push({
      url: r.url(),
      method: r.method(),
      bytes: r.postDataBuffer()?.length ?? 0,
    });
  });
  page.on("console", (m) => console.log("BROWSER", m.type(), m.text()));
  page.on("pageerror", (e) => console.error("PAGE ERROR", e.message));
  await page.goto("http://127.0.0.1:5197/pdf-to-powerpoint", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  console.log("Page loaded");
  await page.waitForSelector("#powerpoint-upload", { state: "attached" });
  await page.evaluate(() => {
    document.querySelector("#powerpoint-upload").addEventListener(
      "change",
      (e) => {
        window.__pptxTestFile = e.target.files[0];
      },
      { capture: true },
    );
  });
  await page.setInputFiles("#powerpoint-upload", input);
  const downloadPromise = page
    .waitForEvent("download", { timeout: 240000 })
    .catch(() => null);
  const report = await page.evaluate(
    async ({ mode, pages }) => {
      // Read local file via the selected input before React clears it: supplied below through File API.
      const file = window.__pptxTestFile;
      const { convertPdfToPowerPoint } = await import(
        "/src/utils/pdfToPowerPoint/convert.ts"
      );
      const networkStart = performance.now();
      const result = await convertPdfToPowerPoint(
        file,
        new AbortController().signal,
        (message) => console.log(message),
        { mode, pages },
      );
      const a = document.createElement("a");
      a.href = URL.createObjectURL(result.blob);
      a.download = "test.pptx";
      a.click();
      return { ...result.report, bytes: result.blob.size, networkStart };
    },
    { mode, pages },
  );
  const download = await downloadPromise;
  if (!download) throw Error("Missing download");
  await download.saveAs(output);
  await fs.writeFile(
    output + ".json",
    JSON.stringify({ input, mode, report, network }, null, 2),
  );
  console.log(JSON.stringify({ input, output, report }));
} finally {
  await browser.close();
}
