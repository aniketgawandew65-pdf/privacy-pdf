import type { Grid, PageModel } from "./model.ts";
import { isRotated } from "./geometry.ts";

export type ReconstructionMode = "flow" | "positioned" | "visual-hybrid";

export interface ReconstructionStrategy {
  mode: ReconstructionMode;
  score: number;
  reasons: string[];
}

/**
 * Decide how aggressively a page should preserve source geometry.
 *
 * - flow: ordinary prose can use native Word flow.
 * - positioned: preserve coordinates, but paragraphs can still be grouped.
 * - visual-hybrid: keep the extracted text editable while relying on the
 *   text-free artwork layer and source-positioned lines for visual fidelity.
 *
 * The decision is geometry/content based and contains no vendor-, bank- or
 * template-specific knowledge.
 */
export function chooseReconstructionStrategy(
  page: PageModel,
  tables: Grid[],
  hasColumns: boolean,
  intentionalGap: boolean,
): ReconstructionStrategy {
  const reasons: string[] = [];
  let score = 0;

  const rotated = page.spans.filter(isRotated).length;
  const riskyScale = page.spans.filter((s) => (s.scale ?? 100) < 72 || (s.scale ?? 100) > 138).length;
  const scaleRatio = riskyScale / Math.max(1, page.spans.length);
  const backgroundArea = page.pictures
    .filter((picture) => picture.background)
    .reduce((area, picture) => area + picture.width * picture.height, 0);
  const backgroundRatio = Math.min(1, backgroundArea / Math.max(1, page.width * page.height));
  const denseRules = page.rules.length >= 55;
  const manyRules = page.rules.length >= 120;
  const manyFonts = new Set(page.spans.map((s) => s.outputFont || s.font)).size >= 6;

  if (tables.length) {
    score += 1;
    reasons.push("editable table geometry");
  }
  if (hasColumns) {
    score += 1;
    reasons.push("multiple horizontal regions");
  }
  if (intentionalGap) {
    score += 1;
    reasons.push("large source-position gaps");
  }
  if (rotated) {
    score += 2;
    reasons.push("rotated or diagonal text");
  }
  if (scaleRatio >= 0.08) {
    score += 2;
    reasons.push("font-metric width risk");
  }
  if (backgroundRatio >= 0.18) {
    score += 2;
    reasons.push("significant preserved artwork");
  } else if (page.pictures.some((picture) => picture.background)) {
    score += 1;
    reasons.push("preserved artwork");
  }
  if (manyRules) {
    score += 2;
    reasons.push("dense vector layout");
  } else if (denseRules) {
    score += 1;
    reasons.push("vector layout");
  }
  if (manyFonts) {
    score += 1;
    reasons.push("mixed font metrics");
  }

  if (!tables.length && !hasColumns && !intentionalGap && !rotated && !page.pictures.length && page.rules.length < 20 && scaleRatio < 0.04)
    return { mode: "flow", score, reasons };

  if (score >= 4)
    return { mode: "visual-hybrid", score, reasons };

  return { mode: "positioned", score, reasons };
}
