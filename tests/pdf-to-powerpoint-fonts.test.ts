import test from "node:test";
import assert from "node:assert/strict";
import {
  substituteFont,
  trackingLimit,
} from "../src/utils/pdfToPowerPoint/fonts.ts";
test("face names override incorrect generic PDF family flags", () => {
  assert.equal(substituteFont("ArialMT", "monospace"), "Arial");
  assert.equal(
    substituteFont("ABCDEF+TimesNewRomanPSMT", "sans-serif"),
    "Times New Roman",
  );
  assert.equal(substituteFont("CourierNewPSMT", "sans-serif"), "Courier New");
  assert.equal(substituteFont("Gotham-Book", "sans-serif"), "Arial");
  assert.equal(substituteFont("OpenSans-Bold", "serif"), "Arial");
});
test("short-fragment tolerance is bounded by relative width and does not weaken long-run rejection", () => {
  assert.ok(11.742 - 10.33 < trackingLimit(2, 11.742, 10.33, 6));
  assert.ok(14 - 10.33 > trackingLimit(2, 14, 10.33, 6));
  assert.equal(trackingLimit(10, 60, 54, 6), 6 * 0.2);
  assert.equal(trackingLimit(2, 12, 0, 6), 6 * 0.2);
});
test("unknown names retain conservative generic family substitution", () => {
  assert.equal(substituteFont("SubsetFont", "monospace"), "Courier New");
  assert.equal(substituteFont("SubsetFont", "serif"), "Times New Roman");
  assert.equal(substituteFont("SubsetFont", "sans-serif"), "Arial");
});
