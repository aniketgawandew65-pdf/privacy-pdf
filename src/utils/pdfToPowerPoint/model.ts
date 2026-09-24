/** All geometry is in PDF viewport points (top-left origin). */
export interface Size {
  width: number;
  height: number;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface SlideText extends Rect {
  text: string;
  font: string;
  size: number;
  bold: boolean;
  italic: boolean;
  color: string;
  opacity: number;
  rotation: number;
  spacing: number;
  rtl: boolean;
}
export interface SlideLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  color: string;
}
export interface SlideLink extends Rect {
  url: string;
}
/** A verified rectangular grid. Empty cells remain empty and values are never inferred. */
export interface SlideTable extends Rect {
  columns: number[];
  rows: number[];
  cells: (SlideText | null)[][];
  border: { width: number; color: string };
}
export interface SlidePage extends Size {
  sourcePage: number;
  texts: SlideText[];
  tables?: SlideTable[];
  lines: SlideLine[];
  links: SlideLink[];
  image: Uint8Array;
  imageType: "png" | "jpg";
}
export type ConversionMode = "auto" | "fidelity";
export interface PageReport {
  sourcePage: number;
  kind: "editable" | "hybrid" | "image" | "blank";
  editableCharacters: number;
  preservedCharacters: number;
  reason: string;
  renderPixels: number;
  nativeTables?: number;
}
export interface ConversionReport {
  pages: PageReport[];
  elapsedMs: number;
  mixedSizes: boolean;
  warnings: string[];
}
