import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
const base = process.env.PREVIEW_URL || "http://127.0.0.1:5192";
await fs.mkdir(".local/output", { recursive: true });
await fs.mkdir(".local/qa", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_EXECUTABLE ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const pairs = [
  ["payslip", process.env.PAYSLIP_PDF],
  ["bond", process.env.BOND_PDF],
];
try {
  for (const [name, path] of pairs) {
    if (!path)
      throw Error("Set PAYSLIP_PDF and BOND_PDF to local reference paths.");
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    const network = [];
    page.on("request", (r) =>
      network.push({
        url: r.url(),
        method: r.method(),
        body: r.postData()?.length || 0,
      }),
    );
    page.on("pageerror", (e) => console.log("PAGE ERROR", e.message));
    await page.goto(base);
    await page.locator("#file").setInputFiles(path);
    await page.locator("#convert").waitFor();
    await page.waitForFunction(
      () =>
        !document.querySelector("#convert").disabled ||
        document.querySelector("#status").classList.contains("error"),
    );
    console.log(name, "read", await page.locator("#status").textContent());
    await page.locator("#convert").click();
    await page.waitForFunction(
      () =>
        !document.querySelector("#download").hidden ||
        document.querySelector("#status").classList.contains("error"),
      {},
      { timeout: 120000 },
    );
    const status = await page.locator("#status").textContent();
    console.log(name, status);
    if (await page.locator("#download").isHidden()) throw Error(status);
    const pending = page.waitForEvent("download");
    await page.locator("#download").click();
    const download = await pending;
    await download.saveAs(`.local/output/${name}-editable.docx`);
    const report = await page.evaluate(() => window.conversionReport);
    await fs.writeFile(
      `.local/output/${name}-report.json`,
      JSON.stringify({ report, network }, null, 2),
    );
    console.log(name, JSON.stringify(report));
    if (
      network.some(
        (r) =>
          r.method !== "GET" ||
          (!r.url.startsWith(base) && !r.url.startsWith("blob:")),
      )
    )
      throw Error("Unexpected outbound traffic");
    await page.screenshot({
      path: `.local/qa/${name}-app.png`,
      fullPage: true,
    });
    await context.close();
  }
} finally {
  await browser.close();
}
