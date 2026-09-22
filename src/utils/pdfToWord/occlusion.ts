import type { Span } from "./model.ts";
import type { GlyphRun, TextFragment } from "./text-policy.ts";

export interface OpaqueImageOccluder {
  operatorIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

/**
 * Match ordinary extracted text items back to the PDF drawing operation which
 * painted them. This is intentionally separate from the existing text
 * preservation policy so barcode/symbol handling stays untouched.
 */
export function mapTextItemsToOperatorEnds(
  items: TextFragment[],
  runs: GlyphRun[],
): number[] {
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

  return items.map((item) => {
    const font = fonts.get(item.fontName),
      text = normalize(item.str);
    if (!font || !text) return -1;

    const start = font.text.indexOf(text, font.cursor);
    if (start < 0) return -1;

    const end = start + text.length;
    font.cursor = end;
    const ops = font.ranges
      .filter((range) => range.start < end && range.end > start)
      .map((range) => range.op);

    return ops.length ? Math.max(...ops) : -1;
  });
}

export function spanInkRect(span: Span) {
  const ink = span.ink ?? {
    x: 0,
    y: -span.size * 0.8,
    width: span.width,
    height: span.size,
  };

  return {
    x: span.x + ink.x,
    y: span.y + ink.y,
    width: Math.max(1, ink.width),
    height: Math.max(1, ink.height),
  };
}

/**
 * Only flag horizontal text which is completely covered by a later opaque
 * image operation. The rendered artwork is checked separately before removal,
 * so this is a conservative z-order candidate test rather than a broad
 * "background overlaps text" heuristic.
 */
export function laterOpaqueImageCovering(
  span: Span,
  textOperatorIndex: number,
  images: OpaqueImageOccluder[],
): OpaqueImageOccluder | null {
  if (textOperatorIndex < 0) return null;

  const angle = ((span.rotation ?? 0) % 360 + 360) % 360;
  const horizontalDelta = Math.min(
    angle,
    Math.abs(angle - 180),
    Math.abs(angle - 360),
  );
  if (horizontalDelta > 1) return null;

  const rect = spanInkRect(span);
  const right = rect.x + rect.width,
    bottom = rect.y + rect.height;
  const tolerance = Math.min(1.5, Math.max(0.5, span.size * 0.1));

  return (
    images.find((image) => {
      if (image.operatorIndex <= textOperatorIndex || image.opacity < 0.98)
        return false;
      const imageRight = image.x + image.width,
        imageBottom = image.y + image.height;
      return (
        image.x <= rect.x + tolerance &&
        image.y <= rect.y + tolerance &&
        imageRight >= right - tolerance &&
        imageBottom >= bottom - tolerance
      );
    }) ?? null
  );
}
