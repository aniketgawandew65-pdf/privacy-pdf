import type { FontClass } from './model.ts';

export interface FontHints {
  name?: string;
  fallbackName?: string;
  flags?: number;
  bold?: boolean;
  italic?: boolean;
  ascent?: number;
  descent?: number;
}

export function classifyFont(hints: FontHints): FontClass {
  const name = hints.name || '';
  const fallback = hints.fallbackName || '';
  // PDF font descriptor bits take precedence over names when supplied.
  if ((hints.flags ?? 0) & 1 || /mono|courier|consolas|typewriter/i.test(name + fallback)) return 'monospace';
  if (/symbol|dingbat|wingding/i.test(name)) return 'symbolic';
  if ((hints.flags ?? 0) & 2) return 'serif';
  if (/sans|helvetica|arial|gotham|aptos|calibri|verdana|futura|grotesk|gothic|roboto|inter(?:-|$)|mulish/i.test(name)) return 'sans-serif';
  if (/times|georgia|garamond|baskerville|palatino|cambria|serif|roman/i.test(name)) return 'serif';
  if (/sans/i.test(fallback)) return 'sans-serif';
  if (/serif/i.test(fallback)) return 'serif';
  // An opaque subset name is not evidence for Times New Roman.
  return 'sans-serif';
}

export function fontProfile(hints: FontHints) {
  const family = (hints.name || '').replace(/^[A-Z]{6}\+/, '')
    .replace(/PSMT$|PS-BoldMT$|PS-ItalicMT$|PS-BoldItalicMT$/i, '')
    .replace(/[-,](BoldItalic|BoldOblique|ExtraBold|SemiBold|DemiBold|Bold|Black|Heavy|Italic|Oblique|Regular|Roman|Medium|Light|ExtraLight|Thin)$/i, '') || 'Unknown';
  const fontClass = classifyFont(hints);
  const fallback = fontClass === 'monospace' ? 'Courier New' : fontClass === 'serif' ? 'Times New Roman' : 'Arial';
  return { family, fontClass, fallback };
}

/** Calibrate fallback text advance against the PDF, without changing the text. */
export function advanceScale(sourceWidth: number, measuredWidth: number): number {
  if (!(sourceWidth > 0 && measuredWidth > 0)) return 100;
  return Math.floor(Math.max(1, Math.min(600, sourceWidth / measuredWidth * 100)));
}


export interface MetricFontMatchInput extends FontHints {
  text: string;
  size: number;
  sourceWidth: number;
  measure: Pick<CanvasRenderingContext2D, "font" | "measureText">;
  isAvailable: (family: string) => boolean;
}

/**
 * Pick an installed Word-friendly font whose measured advance is closest to
 * the source PDF. This is deliberately local and deterministic: no font is
 * downloaded or uploaded, and the source family wins when it is available
 * and metrically reasonable.
 */
export function metricMatchedFont(input: MetricFontMatchInput) {
  const profile = fontProfile(input);
  const byClass: Record<FontClass, string[]> = {
    "sans-serif": [
      "Aptos",
      "Arial",
      "Calibri",
      "Carlito",
      "Helvetica",
      "Liberation Sans",
      "Noto Sans",
      "DejaVu Sans",
      "Trebuchet MS",
      "Verdana",
      "Tahoma",
    ],
    serif: [
      "Times New Roman",
      "Cambria",
      "Georgia",
      "Liberation Serif",
      "Noto Serif",
      "DejaVu Serif",
    ],
    monospace: [
      "Consolas",
      "Courier New",
      "Liberation Mono",
      "DejaVu Sans Mono",
    ],
    symbolic: ["Arial", "Noto Sans Symbols", "Segoe UI Symbol"],
  };
  const candidates = [...new Set([profile.family, ...byClass[profile.fontClass], profile.fallback])];
  const style = `${input.italic ? "italic " : ""}${input.bold ? "bold " : ""}${input.size}px`;
  const sourceWidth = Math.max(1, Math.abs(input.sourceWidth));

  let best = profile.fallback;
  let bestError = Number.POSITIVE_INFINITY;
  for (const family of candidates) {
    if (!family || !input.isAvailable(family)) continue;
    input.measure.font = `${style} "${family}"`;
    const width = input.measure.measureText(input.text).width;
    if (!(width > 0)) continue;
    const error = Math.abs(width - sourceWidth) / sourceWidth;
    const sourceBias = family.toLowerCase() === profile.family.toLowerCase() ? -0.015 : 0;
    if (error + sourceBias < bestError) {
      best = family;
      bestError = error + sourceBias;
    }
  }
  return {
    family: best,
    sourceFamily: profile.family,
    fontClass: profile.fontClass,
    error: Number.isFinite(bestError) ? Math.max(0, bestError) : null,
    sourceAvailable: input.isAvailable(profile.family),
  };
}
