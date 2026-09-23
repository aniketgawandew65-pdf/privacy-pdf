// Production-build QA: start `vite preview --port 5198 --strictPort` first.
import assert from "node:assert/strict";
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
try {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5198/pdf-to-powerpoint", {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await page.waitForSelector("#powerpoint-upload", {
    state: "attached",
    timeout: 60000,
  });
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Reload under the installed service worker to prime the HTML navigation cache.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#powerpoint-upload", { state: "attached" });
  await page.setInputFiles("#powerpoint-upload", `${root}/simple.pdf`);
  const button = page.getByRole("button", {
    name: "Convert to PowerPoint",
    exact: true,
  });
  await button.waitFor();
  const requests = [];
  page.on("request", (r) =>
    requests.push({
      url: r.url(),
      method: r.method(),
      body: r.postData() ?? "",
    }),
  );
  await button.click();
  await page
    .getByRole("link", { name: "Download PowerPoint", exact: true })
    .waitFor({ timeout: 90000 });
  const onlineRequests = requests.splice(0);
  await fs.writeFile(`${root}/network-debug.json`,JSON.stringify(onlineRequests,null,2));
  console.log("Conversion request endpoints", onlineRequests.map(({url,method})=>({url:new URL(url).origin+new URL(url).pathname,method})));
  assert.ok(
    !onlineRequests.some(
      (r) => {
        const url=new URL(r.url);
        const existingAnalytics=(url.hostname==='www.google-analytics.com'||url.hostname==='region1.google-analytics.com')&&url.pathname==='/g/collect';
        return r.method!=='GET'&&!existingAnalytics;
      },
    ),
    "Unexpected request during conversion",
  );
  assert.ok(
    !onlineRequests.some(
      (r) =>
        (r.body+r.url).includes("Editable invoice") || (r.body+r.url).includes("simple.pdf"),
    ),
    "Document data in network request",
  );
  await page.getByRole("button", { name: "Remove file", exact: true }).click();
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("#powerpoint-upload", { state: "attached" });
  await page.setInputFiles("#powerpoint-upload", `${root}/unicode.pdf`);
  await page.getByLabel("Conversion mode").selectOption("fidelity");
  await page
    .getByRole("button", { name: "Convert to PowerPoint", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Download PowerPoint", exact: true })
    .waitFor({ timeout: 90000 });
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("link", { name: "Download PowerPoint", exact: true })
    .click();
  await (await downloadPromise).saveAs(`${root}/offline-unicode.pptx`);
  await page.screenshot({ path: `${root}/offline.png`, fullPage: true });
  const autoContext=await browser.newContext();
  const autoPage=await autoContext.newPage();
  await autoPage.goto('http://127.0.0.1:5198/pdf-to-powerpoint',{waitUntil:'domcontentloaded'});
  await autoPage.waitForSelector('#powerpoint-upload',{state:'attached'});
  await autoPage.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await autoPage.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  await autoPage.setInputFiles('#powerpoint-upload',`${root}/simple.pdf`);
  await autoContext.setOffline(true);
  await autoPage.getByRole('button',{name:'Convert to PowerPoint',exact:true}).click();
  await autoPage.getByRole('link',{name:'Download PowerPoint',exact:true}).waitFor({timeout:90000});
  const result = {
    offlineAutoConversion:true,
    offlineReload: true,
    offlineConversion: true,
    mode: "fidelity",
    onlineConversionRequests: onlineRequests.map(({ url, method }) => ({
      url: new URL(url).origin + new URL(url).pathname,
      method,
    })),
    documentUploadObserved: false,
  };
  await fs.writeFile(`${root}/offline.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
