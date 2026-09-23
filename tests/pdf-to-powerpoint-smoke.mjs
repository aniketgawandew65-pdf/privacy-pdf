// Read-only smoke of existing tool implementations after additive route integration.
import fs from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const root = process.argv[2] || "/private/tmp/pdf-to-powerpoint-qa";
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
});
const outcomes = [];
try {
  for (const [route, file, button, done] of [
    ["pdf-to-word", "simple.pdf", "Convert to Word", "Download Word document"],
    ["pdf-to-jpg", "simple.pdf", "Convert PDF to JPG", "Download All as ZIP"],
    [
      "ocr-pdf",
      "scan.pdf",
      "Make PDF Searchable (1 Pages)",
      "Download Searchable PDF",
    ],
    ["rotate-pdf", "simple.pdf", "Rotate PDF +90°", "Download Rotated PDF"],
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:5197/${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    const input = page
      .locator('input[type=file][accept="application/pdf"],#word-upload')
      .first();
    await input.waitFor({ state: "attached", timeout: 60000 });
    await input.setInputFiles(`${root}/${file}`);
    await page
      .getByRole("button", { name: button, exact: true })
      .click({ timeout: 60000 });
    try {
      await page.getByText(done, { exact: true }).waitFor({ timeout: 180000 });
    } catch (error) {
      const alerts = await page.locator("[role=alert]").allTextContents();
      throw Error(
        `${route} smoke failed: ${alerts.join(" | ") || error.message}`,
      );
    }
    outcomes.push({ route, passed: true });
    console.log(route, "PASS");
    await context.close();
  }
  await fs.writeFile(`${root}/smoke.json`, JSON.stringify(outcomes, null, 2));
} finally {
  await browser.close();
}
