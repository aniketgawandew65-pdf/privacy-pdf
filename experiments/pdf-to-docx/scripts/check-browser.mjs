import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_EXECUTABLE ||
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
const base = process.env.PREVIEW_URL || "http://127.0.0.1:5192";
try {
  const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    }),
    page = await context.newPage();
  const unexpected = [];
  await context.route("**/*", async (route) => {
    const r = route.request();
    if (r.method() !== "GET" || !r.url().startsWith(base)) {
      unexpected.push(r.url());
      return route.abort();
    }
    return route.continue();
  });
  const status = async () => {
    await page.waitForFunction(
      () =>
        document.querySelector("#status").classList.contains("error") ||
        !document.querySelector("#convert").disabled,
    );
    return page.locator("#status").textContent();
  };
  await page.goto(base);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.locator("#file").setInputFiles({
    name: "bad.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("not a pdf"),
  });
  assert.match(await status(), /not a readable PDF/);
  console.log("PASS invalid PDF");
  await page.locator("#file").setInputFiles({
    name: "corrupt.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\ncorrupt content"),
  });
  assert.match(await status(), /Invalid PDF|PDF/i);
  assert.equal(await page.locator("#convert").isDisabled(), true);
  console.log("PASS corrupt PDF");
  await page.locator("#file").setInputFiles({
    name: "oversized.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(31 * 1024 * 1024),
  });
  assert.match(await status(), /30 MB/);
  console.log("PASS size limit");
  const blank = await PDFDocument.create();
  blank.addPage();
  await page.locator("#file").setInputFiles({
    name: "no-text.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await blank.save()),
  });
  await status();
  await page.locator("#convert").click();
  await page.waitForFunction(() =>
    document.querySelector("#status").classList.contains("error"),
  );
  assert.match(
    await page.locator("#status").textContent(),
    /no extractable text/,
  );
  assert.equal(await page.locator("#download").isHidden(), true);
  console.log("PASS nontext page rejected without screenshot-only output");
  const long = await PDFDocument.create();
  for (let i = 0; i < 61; i++) long.addPage();
  await page.locator("#file").setInputFiles({
    name: "too-many.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(await long.save()),
  });
  assert.match(await status(), /60 pages/);
  console.log("PASS page limit");
  if (process.env.ENCRYPTED_PDF) {
    await page.locator("#file").setInputFiles(process.env.ENCRYPTED_PDF);
    assert.match(await status(), /Password-protected/);
    console.log("PASS password PDF");
  }
  if (process.env.BOND_PDF) {
    await page.locator("#file").setInputFiles(process.env.BOND_PDF);
    await status();
    await page.locator("#convert").click();
    await page.locator("#cancel").click();
    await page.waitForFunction(() =>
      document
        .querySelector("#status")
        .textContent.startsWith("Conversion cancelled"),
    );
    assert.equal(await page.locator("#download").isHidden(), true);
    assert.equal(await page.locator("#file").isDisabled(), false);
    console.log("PASS cancellation");
  }
  assert.deepEqual(unexpected, []);
  console.log("PASS no external or document upload requests; mobile-width UI");
  await context.close();
} finally {
  await browser.close();
}
