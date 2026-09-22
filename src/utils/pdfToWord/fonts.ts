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
  if (/sans|helvetica|arial|gotham|aptos|calibri|verdana|futura|grotesk|gothic|roboto|inter(?:-|$)/i.test(name)) return 'sans-serif';
  if (/times|georgia|garamond|baskerville|palatino|cambria|serif|roman/i.test(name)) return 'serif';
  if (/sans/i.test(fallback)) return 'sans-serif';
  if (/serif/i.test(fallback)) return 'serif';
  // An opaque subset name is not evidence for Times New Roman.
  return 'sans-serif';
}

export function fontProfile(hints: FontHints) {
  const family = (hints.name || '').replace(/^[A-Z]{6}\+/, '')
    .replace(/PSMT$|PS-BoldMT$|PS-ItalicMT$|PS-BoldItalicMT$/i, '')
    .replace(/[-,](BoldItalic|BoldOblique|Bold|Italic|Oblique|Regular|Roman|Medium)$/i, '') || 'Unknown';
  const fontClass = classifyFont(hints);
  const fallback = fontClass === 'monospace' ? 'Courier New' : fontClass === 'serif' ? 'Times New Roman' : 'Arial';
  return { family, fontClass, fallback };
}

/** Calibrate fallback text advance against the PDF, without changing the text. */
export function advanceScale(sourceWidth: number, measuredWidth: number): number {
  if (!(sourceWidth > 0 && measuredWidth > 0)) return 100;
  return Math.floor(Math.max(1, Math.min(600, sourceWidth / measuredWidth * 100)));
}
