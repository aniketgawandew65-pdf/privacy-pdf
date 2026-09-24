import type { SlideLine } from "./model.ts";
export interface Rule extends SlideLine {
  operation: number;
}
export interface RuleOperations {
  save: number;
  restore: number;
  transform: number;
  constructPath: number;
  stroke: number;
  closeStroke: number;
  setLineWidth: number;
  setStrokeRGBColor: number;
  setDash: number;
  setGState: number;
  clip: number;
  eoClip: number;
  paintFormXObjectBegin: number;
  paintFormXObjectEnd: number;
  beginGroup: number;
  setStrokeColorN?: number;
  setStrokeTransparent?: number;
  setLineCap?: number;
}
type Matrix = number[];
const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];
/** Snapshot straight stroke geometry before PDF.js replaces the numeric paths
 * with Path2D objects during rendering. Unsafe/clipped paths are not migrated. */
export function collectRules(
  fnArray: number[],
  argsArray: unknown[][],
  viewport: Matrix,
  ops: RuleOperations,
): Rule[] {
  // Table analysis is optional. Bound its extra work on vector-heavy pages.
  if (fnArray.length > 100_000) return [];
  let state = { matrix: viewport, width: 1, color: "000000", unsafe: false };
  const stack: (typeof state)[] = [];
  const output: Rule[] = [];
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i],
      args = argsArray[i];
    if (fn === ops.save) stack.push({ ...state });
    else if (fn === ops.restore) state = stack.pop() ?? state;
    else if (fn === ops.transform)
      state = { ...state, matrix: multiply(state.matrix, args as number[]) };
    else if (fn === ops.paintFormXObjectBegin) {
      stack.push({ ...state });
      state = { ...state, unsafe: true };
    } else if (fn === ops.paintFormXObjectEnd) state = stack.pop() ?? state;
    else if (fn === ops.setLineWidth) state.width = Number(args[0]);
    else if (fn === ops.setStrokeRGBColor)
      state.color = String(args[0]).replace("#", "");
    else if (
      fn === ops.setStrokeColorN ||
      fn === ops.setStrokeTransparent ||
      (fn === ops.setLineCap && args[0] !== 0)
    )
      state.unsafe = true;
    else if (fn === ops.clip || fn === ops.eoClip || fn === ops.beginGroup)
      state.unsafe = true;
    else if (fn === ops.setDash && (args[0] as number[]).length)
      state.unsafe = true;
    else if (fn === ops.setGState) {
      for (const [key, value] of args[0] as [string, unknown][]) {
        if (key === "LW") state.width = Number(value);
        if (
          (key === "CA" && value !== 1) ||
          (key === "BM" && value !== "source-over") ||
          (key === "SMask" && value) ||
          (key === "LC" && value !== 0) ||
          key === "D" ||
          key === "TR"
        )
          state.unsafe = true;
      }
    } else if (
      fn === ops.constructPath &&
      !state.unsafe &&
      (args[0] === ops.stroke || args[0] === ops.closeStroke)
    ) {
      const data = (args[1] as ArrayLike<unknown>)?.[0];
      if (!Array.isArray(data) && !ArrayBuffer.isView(data)) continue;
      if ((data as ArrayLike<number>).length > 20_000) return [];
      const path = Array.from(data as ArrayLike<number>),
        segments: Rule[] = [];
      let x = 0,
        y = 0,
        startX = 0,
        startY = 0,
        valid = true;
      const point = (x: number, y: number) => [
        state.matrix[0] * x + state.matrix[2] * y + state.matrix[4],
        state.matrix[1] * x + state.matrix[3] * y + state.matrix[5],
      ];
      const line = (toX: number, toY: number) => {
        const [x1, y1] = point(x, y),
          [x2, y2] = point(toX, toY);
        const horizontal = Math.abs(y2 - y1) < 0.1,
          vertical = Math.abs(x2 - x1) < 0.1;
        if (!horizontal && !vertical) valid = false;
        else if (Math.hypot(x2 - x1, y2 - y1) > 0.5) {
          const scale = horizontal
            ? Math.hypot(state.matrix[2], state.matrix[3])
            : Math.hypot(state.matrix[0], state.matrix[1]);
          segments.push({
            x1,
            y1,
            x2,
            y2,
            width: Math.max(0.1, state.width * scale),
            color: state.color,
            operation: i,
          });
        }
        x = toX;
        y = toY;
      };
      for (let j = 0; j < path.length && valid; ) {
        const kind = path[j++];
        if (kind === 0) {
          x = path[j++];
          y = path[j++];
          startX = x;
          startY = y;
        } else if (kind === 1) line(path[j++], path[j++]);
        else if (kind === 4) line(startX, startY);
        else valid = false;
      }
      if (args[0] === ops.closeStroke) line(startX, startY);
      if (
        valid &&
        segments.length &&
        segments.every(
          (s) =>
            [s.x1, s.y1, s.x2, s.y2, s.width].every(Number.isFinite) &&
            s.width <= 4 &&
            /^[0-9a-f]{6}$/i.test(s.color),
        )
      )
        output.push(...segments);
      if (output.length > 2000) return [];
    }
  }
  return output;
}
