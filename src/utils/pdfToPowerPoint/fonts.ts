/** PDF family flags can be wrong (for example ArialMT marked monospace).
 * Recognized face names take precedence over the PDF's generic family hint.
 * Keep the same portable substitutes; do not embed unlicensed PDF subsets. */
export function substituteFont(name: string, family: string): string {
  if (/courier|consolas|monaco|mono/i.test(name)) return "Courier New";
  if (
    /arial|helvetica|tahoma|verdana|calibri|gotham|open.?sans|sans/i.test(name)
  )
    return "Arial";
  if (/times|cambria|georgia|serif/i.test(name)) return "Times New Roman";
  if (/mono/i.test(family)) return "Courier New";
  return /serif/i.test(family) && !/sans/i.test(family)
    ? "Times New Roman"
    : "Arial";
}

/** A two-letter fragment has only one tracking gap, so normal font substitution
 * can concentrate its entire width difference there. Bound that case by both
 * font size and relative width; longer runs retain the tighter per-gap limit. */
export function trackingLimit(
  length: number,
  width: number,
  measured: number,
  size: number,
): number {
  return length === 2 && measured > 0 && Math.abs(width / measured - 1) <= 0.2
    ? size * 0.3
    : size * 0.2;
}
