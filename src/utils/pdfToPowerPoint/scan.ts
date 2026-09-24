import type { Size } from "./model.ts";
type Operations = Record<string, number>;
const multiply = (a: number[], b: number[]) => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
/** A single full-page raster has no extra detail beyond its source pixels.
 * Any text, annotation, vector, clipping, mask, repeated image or unknown operator
 * retains the normal rendering budget. This only avoids needless upsampling. */
export function scanScale(
  fnArray: number[],
  argsArray: unknown[][],
  viewport: number[],
  size: Size,
  limit: number,
  ops: Operations,
): number {
  const allowed = new Set(
    [
      "save",
      "restore",
      "transform",
      "dependency",
      "setFillRGBColor",
      "setStrokeRGBColor",
      "setLineWidth",
      "setLineCap",
      "setLineJoin",
      "setMiterLimit",
      "setDash",
      "beginText",
      "endText",
      "setFont",
      "setLeading",
      "setCharSpacing",
      "setWordSpacing",
      "setHScale",
      "setTextRenderingMode",
      "setTextRise",
      "moveText",
      "setLeadingMoveText",
      "setTextMatrix",
      "nextLine",
    ].map((k) => ops[k]),
  );
  let matrix = viewport,
    scale = limit,
    images = 0;
  const stack: number[][] = [];
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i],
      args = argsArray[i];
    if (fn === ops.save) stack.push(matrix);
    else if (fn === ops.restore) {
      if (!stack.length) return limit;
      matrix = stack.pop()!;
    } else if (fn === ops.transform)
      matrix = multiply(matrix, args as number[]);
    else if (fn === ops.paintImageXObject) {
      if (++images > 1) return limit;
      const [a, b, c, d, e, f] = matrix,
        width = Number(args[1]),
        height = Number(args[2]);
      if (
        ![...matrix, width, height].every(Number.isFinite) ||
        width <= 0 ||
        height <= 0
      )
        return limit;
      // Only axis-aligned full-page images, including quarter-turn rotations.
      if (
        !(
          (Math.abs(b) < 0.001 && Math.abs(c) < 0.001) ||
          (Math.abs(a) < 0.001 && Math.abs(d) < 0.001)
        )
      )
        return limit;
      const xs = [e, e + a, e + c, e + a + c],
        ys = [f, f + b, f + d, f + b + d];
      if (
        Math.abs(Math.min(...xs)) > 0.1 ||
        Math.abs(Math.min(...ys)) > 0.1 ||
        Math.abs(Math.max(...xs) - size.width) > 0.1 ||
        Math.abs(Math.max(...ys) - size.height) > 0.1
      )
        return limit;
      scale = Math.min(
        limit,
        Math.max(width / Math.hypot(a, b), height / Math.hypot(c, d)),
      );
    } else if (!allowed.has(fn)) return limit;
  }
  return images === 1 && scale > 0 ? scale : limit;
}
