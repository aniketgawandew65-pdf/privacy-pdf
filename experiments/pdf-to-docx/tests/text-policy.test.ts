import { test } from "node:test";
import assert from "node:assert/strict";
import { hasUnmappedText, planTextPreservation } from "../src/text-policy.ts";

test("barcode control glyphs preserve all constituent drawing operations, not the font's readable text", () => {
  const items = [
    { str: "Balance 123.45", fontName: "body" },
    { str: "a\x01b", fontName: "custom" },
    { str: "Readable", fontName: "custom" },
  ];
  const runs = [
    { text: "Balance 123.45", fontName: "body", operatorIndex: 1 },
    ...["a", "\x01", "b", "Readable"].map((text, i) => ({
      text,
      fontName: "custom",
      operatorIndex: i + 2,
    })),
  ];
  const plan = planTextPreservation(items, runs);
  assert.deepEqual([...plan.artworkOperators], [2, 3, 4]);
  assert.deepEqual([...plan.artworkItems], [1]);
});
test("split extraction items from one unmapped draw run do not duplicate artwork", () => {
  const plan = planTextPreservation(
    [
      { str: "Text", fontName: "f" },
      { str: "\ufffd", fontName: "f" },
    ],
    [{ text: "Text\ufffd", fontName: "f", operatorIndex: 5 }],
  );
  assert.deepEqual([...plan.artworkItems].sort(), [0, 1]);
});
test("valid text and repeated strings remain editable", () => {
  assert.equal(hasUnmappedText("Normal\ttext\n₹123.45"), false);
  assert.equal(hasUnmappedText("bad\x1f"), true);
  const plan = planTextPreservation(
    [{ str: "aa", fontName: "f" }],
    [{ text: "aa", fontName: "f", operatorIndex: 1 }],
  );
  assert.equal(plan.artworkItems.size, 0);
});
test("unmatched invalid text fails explicitly rather than silently disappearing", () => {
  assert.throws(
    () => planTextPreservation([{ str: "bad\x01", fontName: "f" }], []),
    /could not be matched/,
  );
});
test("long underscore rules remain artwork without consuming adjacent prose", () => {
  const plan = planTextPreservation(
    [
      { str: "__________", fontName: "body" },
      { str: "Next paragraph", fontName: "body" },
    ],
    [
      { text: "__________", fontName: "body", operatorIndex: 1 },
      { text: "Next paragraph", fontName: "body", operatorIndex: 2 },
    ],
  );
  assert.deepEqual([...plan.artworkItems], [0]);
  assert.deepEqual([...plan.artworkOperators], [1]);
});
