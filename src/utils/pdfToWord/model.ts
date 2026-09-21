/** Geometry uses the PDF.js viewport: points, top-left origin; Span.y is a baseline. */
export interface Span {
  text: string;
  x: number;
  y: number;
  width: number;
  size: number;
  font: string;
  bold: boolean;
  italic: boolean;
  color: string;
  underline?: boolean;
}
export interface Rule {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  color: string;
}
export interface Picture {
  x: number;
  y: number;
  width: number;
  height: number;
  data: Uint8Array;
  background?: boolean;
}
export interface PageModel {
  number: number;
  width: number;
  height: number;
  spans: Span[];
  rules: Rule[];
  pictures: Picture[];
  warnings: string[];
}
export interface Line {
  spans: Span[];
  x: number;
  y: number;
  right: number;
  size: number;
}
export interface Cell {
  col: number;
  span: number;
  rowSpan: number;
  x: number;
  y: number;
  width: number;
  height: number;
  spans: Span[];
  borders: { top: boolean; bottom: boolean; left: boolean; right: boolean };
}
export interface Grid {
  x: number;
  y: number;
  width: number;
  height: number;
  xs: number[];
  ys: number[];
  rows: Cell[][];
}
export interface PageSummary {
  page: number;
  textCharacters: number;
  tables: number;
  cells: number;
  mergedCells: number;
  pictures: number;
  paragraphs: number;
  warnings: string[];
}
export interface ConversionReport {
  pages: PageSummary[];
  elapsedMs: number;
  warnings: string[];
}
