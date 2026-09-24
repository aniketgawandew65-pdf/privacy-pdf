import { OPS, Util, type PDFPageProxy } from "pdfjs-word-dist";
import type { Rect, SlideText } from "./model";
import { overlaps } from "./geometry";
import { substituteFont, trackingLimit } from "./fonts";
interface Item {
  hasEOL: boolean;
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName: string;
  dir: string;
}
interface Style {
  fontFamily: string;
  ascent?: number;
  descent?: number;
  vertical?: boolean;
}
interface State {
  font: string;
  color: string;
  opacity: number;
  mode: number;
  unsafe: boolean;
  group: number;
}
interface Operation {
  index: number;
  start: number;
  end: number;
  state: State;
  value: string;
}
const normalized = (s: string) => s.normalize("NFKC").replace(/\s/g, "");
const readable = (s: string) =>
  // eslint-disable-next-line no-control-regex -- Reject invalid PDF control characters.
  !/[\u0000-\u0008\u000b-\u001f\u007f-\u009f\uE000-\uF8FF\uFFFD]/u.test(s);
/** Complex scripts/vertical, skewed or clipped text stay in the rendered artwork. */
export function supportedText(s: string): boolean {
  return (
    readable(s) &&
    /^[\u0020-\u024F\u0370-\u052F\u2000-\u206F\u20A0-\u20CF\u2100-\u214F\uFB00-\uFB06\s]*$/u.test(
      s,
    )
  );
}
export async function editableText(page: PDFPageProxy): Promise<{
  texts: SlideText[];
  omit: Set<number>;
  total: number;
  reason: string;
}> {
  const viewport = page.getViewport({ scale: 1 });
  const [content, ops] = await Promise.all([
    page.getTextContent(),
    page.getOperatorList(),
  ]);
  const items = content.items.filter(
    (i): i is Item => "str" in i && !!i.str.trim(),
  );
  const total = items.reduce((n, i) => n + i.str.length, 0);
  const result = {
    texts: [] as SlideText[],
    omit: new Set<number>(),
    total,
    reason: "",
  };
  if (items.length * ops.fnArray.length > 8_000_000) {
    result.reason =
      "Dense page preserved as artwork to keep analysis responsive.";
    return result;
  }
  if (!total) {
    result.reason = "No visible digital text; page artwork preserved.";
    return result;
  }
  // Clipping and transparency effects are handled per text object below.
  // Safe text elsewhere on the same page can still become editable.
  let state: State = {
    font: "",
    color: "000000",
    opacity: 1,
    mode: 0,
    unsafe: false,
    group: 0,
  };
  const stack: State[] = [];
  const operations: Operation[] = [];
  let cursor = 0,
    group = 0,
    groupDepth = 0;
  const paints: number[] = [];
  for (let index = 0; index < ops.fnArray.length; index++) {
    const fn = ops.fnArray[index],
      args = ops.argsArray[index];
    if (fn === OPS.save || fn === OPS.paintFormXObjectBegin)
      stack.push({ ...state });
    else if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd)
      state = stack.pop() ?? state;
    else if (fn === OPS.beginGroup) groupDepth++;
    else if (fn === OPS.endGroup) groupDepth = Math.max(0, groupDepth - 1);
    else if (fn === OPS.clip || fn === OPS.eoClip) state.unsafe = true;
    else if (fn === OPS.beginText) state.group = ++group;
    else if (fn === OPS.setFont) state.font = args[0];
    else if (fn === OPS.setFillRGBColor)
      state.color =
        typeof args[0] === "string" ? args[0].replace("#", "") : "000000";
    else if (fn === OPS.setFillColorN || fn === OPS.setFillTransparent)
      state.unsafe = true;
    else if (fn === OPS.setTextRenderingMode) state.mode = args[0];
    else if (fn === OPS.setGState) {
      for (const [key, value] of args[0]) {
        if (key === "ca") state.opacity = value;
        if (
          (key === "BM" && value !== "source-over") ||
          (key === "SMask" && value) ||
          (key === "TR" && value)
        )
          state.unsafe = true;
        if (key === "Font") state.font = value[0];
      }
    } else if (fn === OPS.showText) {
      const value = normalized(
        args[0]
          .filter((g: unknown) => typeof g === "object" && g !== null)
          .map((g: { unicode?: string }) => g.unicode ?? "")
          .join(""),
      );
      operations.push({
        index,
        start: cursor,
        end: cursor + value.length,
        state: { ...state, unsafe: state.unsafe || groupDepth > 0 },
        value,
      });
      cursor += value.length;
    } else if (
      fn === OPS.showSpacedText ||
      fn === OPS.nextLineShowText ||
      fn === OPS.nextLineSetSpacingShowText
    ) {
      result.reason = "Unusual text positioning preserved as artwork.";
      return result;
    }
    if (
      fn === OPS.paintImageXObject ||
      fn === OPS.paintInlineImageXObject ||
      fn === OPS.paintImageMaskXObject ||
      fn === OPS.shadingFill ||
      (fn === OPS.constructPath &&
        ![OPS.stroke, OPS.closeStroke, OPS.endPath].includes(args[0]))
    )
      paints.push(index);
  }
  if (
    operations.map((o) => o.value).join("") !==
    items.map((i) => normalized(i.str)).join("")
  ) {
    result.reason = "Text mapping is ambiguous; original appearance preserved.";
    return result;
  }
  const bounds = page.recordedBBoxes;
  if (!bounds) {
    result.reason = "Paint bounds unavailable; original appearance preserved.";
    return result;
  }
  const bbox = (i: number): Rect | null =>
    bounds.isEmpty(i)
      ? null
      : {
          x: bounds.minX(i) * viewport.width,
          y: bounds.minY(i) * viewport.height,
          width: (bounds.maxX(i) - bounds.minX(i)) * viewport.width,
          height: (bounds.maxY(i) - bounds.minY(i)) * viewport.height,
        };
  const candidates = new Map<number, SlideText[]>();
  const rejectedGroups = new Set<number>();
  const measure = document.createElement("canvas").getContext("2d")!;
  cursor = 0;
  for (const item of items) {
    const end = cursor + normalized(item.str).length;
    const covering = operations.filter((o) => o.end > cursor && o.start < end);
    cursor = end;
    const op = covering[0];
    if (!op) continue;
    const reject = () =>
      covering.forEach((o) => rejectedGroups.add(o.state.group));
    if (
      !supportedText(item.str) ||
      covering.some(
        (o) =>
          o.state.font !== item.fontName ||
          o.state.color !== op.state.color ||
          o.state.mode !== 0 ||
          o.state.opacity < 0.999 ||
          o.state.unsafe ||
          o.state.group !== op.state.group,
      )
    ) {
      reject();
      continue;
    }
    const style = content.styles[item.fontName] as Style;
    let fontInfo:
      | {
          name?: string;
          isType3Font?: boolean;
          vertical?: boolean;
          black?: boolean;
          bold?: boolean;
          italic?: boolean;
          missingFile?: boolean;
        }
      | undefined;
    try {
      fontInfo = page.commonObjs.get(item.fontName);
    } catch {
      /* Unresolved fonts stay as artwork. */
    }
    if (
      !style ||
      style.vertical ||
      !fontInfo ||
      fontInfo.isType3Font ||
      fontInfo.vertical
    ) {
      reject();
      continue;
    }
    const t = Util.transform(viewport.transform, item.transform);
    const size = Math.hypot(t[2], t[3]);
    // Horizontal runs only in V1; rotated text remains exactly in page artwork.
    if (
      size < 1 ||
      !Number.isFinite(size) ||
      t[0] <= 0 ||
      Math.abs(t[1]) > 0.001 ||
      Math.abs(t[2]) > 0.001 ||
      t[3] >= 0 ||
      item.dir === "rtl"
    ) {
      reject();
      continue;
    }
    const hint = `${fontInfo.name ?? ""} ${style.fontFamily}`;
    const font = substituteFont(fontInfo.name ?? "", style.fontFamily);
    const bold = !!(
      fontInfo.bold ||
      fontInfo.black ||
      /bold|black|heavy/i.test(hint)
    );
    const italic = !!(fontInfo.italic || /italic|oblique/i.test(hint));
    const width = item.width,
      height = size * 1.3;
    if (![...t, width, height].every(Number.isFinite) || width <= 0) {
      reject();
      continue;
    }
    const ascent =
      font === "Times New Roman"
        ? 0.891
        : font === "Courier New"
          ? 0.833
          : 0.905;
    const rect = { x: t[4], y: t[5] - size * ascent, width, height };
    if (
      rect.x < -0.5 ||
      rect.y < -0.5 ||
      rect.x + width > viewport.width + 0.5 ||
      rect.y + size > viewport.height + 0.5
    ) {
      reject();
      continue;
    }
    // Do not pull an earlier text run in front of later painted artwork.
    if (
      paints.some(
        (i) =>
          i > op.index &&
          (() => {
            const b = bbox(i);
            return b && overlaps(rect, b);
          })(),
      )
    ) {
      reject();
      continue;
    }
    measure.font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}px "${font}"`;
    const measured = measure.measureText(item.str).width;
    const spacing =
      item.str.length > 1 ? (width - measured) / (item.str.length - 1) : 0;
    if (
      !Number.isFinite(spacing) ||
      Math.abs(spacing) >
        trackingLimit(item.str.length, width, measured, size) ||
      (item.str.length === 1 && Math.abs(width - measured) > size * 0.3)
    ) {
      reject();
      continue;
    }
    const text: SlideText = {
      ...rect,
      text: item.str,
      font,
      size,
      bold,
      italic,
      color: op.state.color,
      opacity: 1,
      rotation: 0,
      spacing,
      rtl: false,
    };
    const list = candidates.get(op.state.group) ?? [];
    list.push(text);
    candidates.set(op.state.group, list);
  }
  // Filtering a showText operation also skips its cursor advance. Omit complete
  // BT/ET text objects only, so any text left in the PDF keeps its original cursor.
  for (const op of operations) {
    if (op.value && (!candidates.has(op.state.group) || op.state.mode !== 0))
      rejectedGroups.add(op.state.group);
  }
  // Text left in artwork also keeps its original stacking order. Preserve any
  // earlier candidate that would otherwise be lifted over that text.
  for (const [group, texts] of [...candidates].reverse()) {
    if (rejectedGroups.has(group)) continue;
    const firstIndex = operations.find((o) => o.state.group === group)!.index;
    if (
      operations.some(
        (o) =>
          o.index > firstIndex &&
          rejectedGroups.has(o.state.group) &&
          o.state.mode !== 3 &&
          (() => {
            const b = bbox(o.index);
            return b && texts.some((t) => overlaps(t, b));
          })(),
      )
    )
      rejectedGroups.add(group);
  }
  for (const [group, texts] of candidates) {
    if (rejectedGroups.has(group)) continue;
    result.texts.push(...texts);
    operations
      .filter((o) => o.state.group === group)
      .forEach((o) => result.omit.add(o.index));
  }
  result.reason = result.texts.length
    ? "Reliable digital text is editable; graphics and unsupported text retain the PDF appearance."
    : "Text requires fidelity preservation on this page.";
  return result;
}
