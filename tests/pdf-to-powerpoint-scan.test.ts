import assert from "node:assert/strict";
import test from "node:test";
import { scanScale } from "../src/utils/pdfToPowerPoint/scan.ts";
const ops = {
  save: 1,
  restore: 2,
  transform: 3,
  paintImageXObject: 4,
  showText: 5,
  constructPath: 6,
};
const size = { width: 600, height: 800 },
  viewport = [1, 0, 0, -1, 0, 800];
const run = (
  fn = [1, 3, 4, 2],
  args: unknown[][] = [[], [600, 0, 0, 800, 0, 0], ["image", 900, 1200], []],
) => scanScale(fn, args, viewport, size, 3, ops);
test("single full-page scan never invents resolution or exceeds normal budget", () => {
  assert.equal(run(), 1.5);
  assert.equal(
    run(
      [3, 4],
      [
        [600, 0, 0, 800, 0, 0],
        ["image", 2400, 3200],
      ],
    ),
    3,
  );
  assert.equal(
    run(
      [3, 4],
      [
        [0, 800, -600, 0, 600, 0],
        ["image", 1200, 900],
      ],
    ),
    1.5,
  );
});
test("overlaid text, vector artwork, unknown effects and partial images retain full resolution", () => {
  for (const fn of [5, 6, 99])
    assert.equal(
      run(
        [1, 3, 4, 2, fn],
        [[], [600, 0, 0, 800, 0, 0], ["image", 900, 1200], [], []],
      ),
      3,
    );
  assert.equal(
    run(
      [3, 4],
      [
        [300, 0, 0, 800, 0, 0],
        ["image", 900, 1200],
      ],
    ),
    3,
  );
  assert.equal(
    run(
      [3, 4, 4],
      [
        [600, 0, 0, 800, 0, 0],
        ["image", 900, 1200],
        ["image", 900, 1200],
      ],
    ),
    3,
  );
  assert.equal(
    run(
      [3, 4],
      [
        [600, 0, 0, 800, 0, 0],
        ["image", NaN, 1200],
      ],
    ),
    3,
  );
});
