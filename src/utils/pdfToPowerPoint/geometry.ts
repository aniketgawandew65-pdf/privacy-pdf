import type { Rect, Size } from "./model.ts";
export const emu = (points: number) => Math.round(points * 12700);
export function validSize(size: Size): boolean {
  return [size.width, size.height].every(
    (n) => Number.isFinite(n) && n > 0 && n <= 10_000_000,
  );
}
/** PowerPoint uses a single deck size; every source page is contained, never cropped. */
export function deckSize(first: Size): Size {
  if (!validSize(first)) throw Error("The PDF has invalid page dimensions.");
  const scale = Math.min(1, 1440 / Math.max(first.width, first.height));
  return {
    width: Math.max(72, first.width * scale),
    height: Math.max(72, first.height * scale),
  };
}
export function fitPage(page: Size, deck: Size): Rect & { scale: number } {
  if (!validSize(page) || !validSize(deck))
    throw Error("The PDF has invalid page dimensions.");
  const scale = Math.min(deck.width / page.width, deck.height / page.height);
  const width = page.width * scale,
    height = page.height * scale;
  return {
    x: (deck.width - width) / 2,
    y: (deck.height - height) / 2,
    width,
    height,
    scale,
  };
}
export function renderScale(page: Size, mobile: boolean): number {
  if (!validSize(page)) throw Error("The PDF has invalid page dimensions.");
  return Math.min(
    mobile ? 2.5 : 3,
    Math.sqrt((mobile ? 3_000_000 : 6_000_000) / (page.width * page.height)),
    (mobile ? 3072 : 4096) / Math.max(page.width, page.height),
  );
}
export function overlaps(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}
export function parsePages(value: string, total: number): number[] {
  if (!Number.isSafeInteger(total) || total < 1)
    throw Error("This PDF has no pages.");
  if (!value.trim() || value.trim().toLowerCase() === "all")
    return Array.from({ length: total }, (_, i) => i + 1);
  const selected = new Set<number>();
  for (const part of value.split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match) throw Error("Enter pages such as 1-3, 5 or leave All pages.");
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1]);
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 1 ||
      end > total ||
      end < start
    )
      throw Error(
        `Choose page numbers between 1 and ${total}, with ascending ranges.`,
      );
    for (let i = start; i <= end; i++) selected.add(i);
  }
  return [...selected].sort((a, b) => a - b);
}
export function safeLink(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 8192 ||
    // eslint-disable-next-line no-control-regex -- Reject invalid PDF control characters.
    /[\u0000-\u001f]/.test(value)
  )
    return null;
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:"].includes(url.protocol)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
