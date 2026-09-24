import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import {
  PresentationPackage,
  escapeXml,
} from "../src/utils/pdfToPowerPoint/package.ts";
import {
  deckSize,
  fitPage,
  parsePages,
  renderScale,
  safeLink,
} from "../src/utils/pdfToPowerPoint/geometry.ts";
import type { SlidePage } from "../src/utils/pdfToPowerPoint/model.ts";
const page: SlidePage = {
  width: 595,
  height: 842,
  sourcePage: 3,
  texts: [
    {
      x: 40,
      y: 50,
      width: 180,
      height: 20,
      text: "Account & amount <123.45>",
      font: "Arial",
      size: 12,
      bold: true,
      italic: false,
      color: "112233",
      opacity: 1,
      rotation: 0,
      spacing: 0.1,
      rtl: false,
    },
  ],
  lines: [],
  links: [
    {
      x: 40,
      y: 50,
      width: 180,
      height: 20,
      url: "https://example.com/?a=1&b=2",
    },
    { x: 40, y: 90, width: 100, height: 20, url: "javascript:alert(1)" },
  ],
  image: Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
      "base64",
    ),
  ),
  imageType: "png",
};
test("selected pages remain ordered, unique and strictly validated", () => {
  assert.deepEqual(parsePages("5, 1-3, 2", 5), [1, 2, 3, 5]);
  assert.deepEqual(parsePages("", 3), [1, 2, 3]);
  for (const bad of ["0", "3-1", "2-9", "a", "1,", "1.5"])
    assert.throws(() => parsePages(bad, 5));
});
test("mixed sizes fit without crop and pathological pages have bounded canvases", () => {
  for (const source of [
    { width: 595, height: 842 },
    { width: 842, height: 595 },
    { width: 1, height: 1e7 },
    { width: 12000, height: 12000 },
  ]) {
    const deck = deckSize(source),
      fit = fitPage(source, deck),
      scale = renderScale(source, true);
    assert.ok(fit.x >= 0 && fit.y >= 0);
    assert.ok(fit.x + fit.width <= deck.width + 0.001);
    assert.ok(fit.y + fit.height <= deck.height + 0.001);
    assert.ok(source.width * source.height * scale * scale <= 3000001);
  }
  assert.throws(() => deckSize({ width: Infinity, height: 842 }));
});
test("links restrict active content and XML escapes untrusted PDF text", () => {
  assert.equal(safeLink("javascript:alert(1)"), null);
  assert.equal(safeLink("file:///secret"), null);
  assert.equal(safeLink("https://example.com/"), "https://example.com/");
  assert.equal(escapeXml('A&B<"\u0000'), "A&amp;B&lt;&quot;");
});
test("PPTX relationships, source order, slide dimensions, text, media and links are intact", () => {
  const chunks: Uint8Array[] = [];
  let completed = false;
  const pack = new PresentationPackage(
    { width: 595, height: 842 },
    (error, data, final) => {
      assert.equal(error, null);
      chunks.push(data);
      completed = final;
    },
  );
  pack.addPage(page);
  pack.addPage({ ...page, width: 842, height: 595, sourcePage: 7, texts: [] });
  pack.finish();
  assert.equal(completed, true);
  const all = Buffer.concat(chunks),
    files = unzipSync(all);
  assert.equal(
    all.readUInt16LE(6) & 8,
    0,
    "Office-compatible known-size local ZIP header",
  );
  assert.match(
    strFromU8(files["[Content_Types].xml"]),
    /presentationml.presentation.main\+xml/,
  );
  assert.equal(
    Object.keys(files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .length,
    2,
  );
  assert.match(strFromU8(files["ppt/slides/slide1.xml"]), /PDF page 3/);
  assert.match(strFromU8(files["ppt/slides/slide2.xml"]), /PDF page 7/);
  assert.match(
    strFromU8(files["ppt/slides/slide1.xml"]),
    /Account &amp; amount &lt;123.45&gt;/,
  );
  assert.ok(files["ppt/media/page1.png"].length);
  assert.ok(files["ppt/media/page2.png"].length);
  assert.match(
    strFromU8(files["ppt/slides/_rels/slide1.xml.rels"]),
    /TargetMode="External"/,
  );
  assert.doesNotMatch(
    strFromU8(files["ppt/slides/_rels/slide1.xml.rels"]),
    /javascript/,
  );
  for (const name of Object.keys(files).filter((n) => n.endsWith(".rels"))) {
    const xml = strFromU8(files[name]);
    const prefix =
      name === "_rels/.rels" ? "" : name.slice(0, name.indexOf("/_rels/") + 1);
    for (const rel of xml.matchAll(/<Relationship\b[^>]+>/g)) {
      if (rel[0].includes('TargetMode="External"')) continue;
      const target = /Target="([^"]+)"/.exec(rel[0])![1];
      const resolved = new URL(
        prefix + target,
        "https://package/",
      ).pathname.slice(1);
      assert.ok(files[resolved], `${name}: ${resolved}`);
    }
  }
  assert.throws(() => pack.addPage(page));
});
test("empty presentation fails explicitly", () => {
  const pack = new PresentationPackage({ width: 595, height: 842 }, () => {});
  assert.throws(() => pack.finish());
  pack.terminate();
});
