export interface TextFragment {
  str: string;
  fontName: string;
}
export interface GlyphRun {
  text: string;
  fontName: string;
  operatorIndex: number;
}

// These codes cannot be written as ordinary XML text. Fonts can use them for
// barcode/symbol glyphs, so their presence does not make an entire PDF corrupt.
export const hasUnmappedText = (text: string) =>
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd\ufffe\uffff]/u.test(text);
export const isDecorativeRule = (text: string) =>
  /^[_─━]{8,}$/u.test(text.trim());
const needsArtwork = (text: string) =>
  hasUnmappedText(text) || isDecorativeRule(text);

/** Match extraction fragments to drawing operations without assuming font names. */
export function planTextPreservation(
  items: TextFragment[],
  runs: GlyphRun[],
): { artworkOperators: Set<number>; artworkItems: Set<number> } {
  const artworkOperators = new Set<number>(),
    artworkItems = new Set<number>();
  if (!items.some((item) => needsArtwork(item.str)))
    return { artworkOperators, artworkItems };
  const normalize = (text: string) => text.replace(/\s/g, "");
  const fonts = new Map<
    string,
    {
      text: string;
      cursor: number;
      ranges: { start: number; end: number; op: number }[];
    }
  >();
  for (const run of runs) {
    let font = fonts.get(run.fontName);
    if (!font) {
      font = { text: "", cursor: 0, ranges: [] };
      fonts.set(run.fontName, font);
    }
    const start = font.text.length;
    font.text += normalize(run.text);
    font.ranges.push({ start, end: font.text.length, op: run.operatorIndex });
  }
  const itemOps = items.map((item, index) => {
    const font = fonts.get(item.fontName),
      text = normalize(item.str);
    if (!text) return [];
    const start = font?.text.indexOf(text, font.cursor) ?? -1;
    if (!font || start < 0) {
      if (needsArtwork(item.str))
        throw Error(
          "An unmapped glyph could not be matched to its artwork. Conversion stopped to avoid losing content.",
        );
      return [];
    }
    const end = start + text.length;
    font.cursor = end;
    const ops = font.ranges
      .filter((r) => r.start < end && r.end > start)
      .map((r) => r.op);
    if (needsArtwork(item.str)) {
      artworkItems.add(index);
      for (const op of ops) artworkOperators.add(op);
    }
    return ops;
  });
  // A single showText can be split into several extracted items. Preserve the
  // complete operation and exclude its other items to avoid duplicate text.
  let changed = true;
  while (changed) {
    changed = false;
    itemOps.forEach((ops, index) => {
      if (
        !artworkItems.has(index) &&
        ops.some((op) => artworkOperators.has(op))
      ) {
        artworkItems.add(index);
        for (const op of ops) artworkOperators.add(op);
        changed = true;
      }
    });
  }
  return { artworkOperators, artworkItems };
}
