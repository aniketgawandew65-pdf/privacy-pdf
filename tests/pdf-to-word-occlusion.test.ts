import test from "node:test";
import assert from "node:assert/strict";
import type { Span } from "../src/utils/pdfToWord/model.ts";
import {
  laterOpaqueImageCovering,
  mapTextItemsToOperatorEnds,
  spanInkRect,
} from "../src/utils/pdfToWord/occlusion.ts";

const span = (text: string, x: number, y: number, rotation = 0): Span => ({
  text,
  x,
  y,
  width: 12,
  size: 8,
  font: "Mulish",
  bold: false,
  italic: false,
  color: "000000",
  rotation,
  ink: { x: 0, y: -6, width: 6, height: 7 },
});

test("maps extracted items to the end of their source text operation", () => {
  const items = [
    { str: "1", fontName: "g_d0_f1" },
    { str: "Visible label", fontName: "g_d0_f2" },
  ];
  const runs = [
    { text: "1", fontName: "g_d0_f1", operatorIndex: 2 },
    { text: "Visible ", fontName: "g_d0_f2", operatorIndex: 8 },
    { text: "label", fontName: "g_d0_f2", operatorIndex: 9 },
  ];
  assert.deepEqual(mapTextItemsToOperatorEnds(items, runs), [2, 9]);
});

test("only a later fully covering opaque image is an occlusion candidate", () => {
  const hidden = span("1", 418.2, 43.05);
  const visible = span("Visible", 418.2, 43.05);
  const images = [
    { operatorIndex: 5, x: 0, y: 0, width: 595, height: 67, opacity: 1 },
  ];
  assert.ok(laterOpaqueImageCovering(hidden, 2, images));
  assert.equal(laterOpaqueImageCovering(visible, 9, images), null);
  assert.equal(
    laterOpaqueImageCovering(hidden, 2, [
      { operatorIndex: 5, x: 0, y: 0, width: 595, height: 67, opacity: 0.5 },
    ]),
    null,
  );
});

test("does not apply the image-occlusion rule to rotated editable text", () => {
  assert.equal(
    laterOpaqueImageCovering(span("CONFIDENTIAL", 40, 200, 323), 2, [
      { operatorIndex: 5, x: 0, y: 0, width: 595, height: 842, opacity: 1 },
    ]),
    null,
  );
});

test("uses visible ink rather than the whole text advance for containment", () => {
  assert.deepEqual(spanInkRect(span("1", 10, 20)), {
    x: 10,
    y: 14,
    width: 6,
    height: 7,
  });
});
