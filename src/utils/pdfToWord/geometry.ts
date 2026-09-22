import type { Span } from './model.ts';

/** All page geometry is PDF.js viewport geometry: top-left origin, points. */
export const twips = (points: number) => Math.round(points * 20);
export const emu = (points: number) => Math.round(points * 12700);
export const normalizeAngle = (degrees: number) => ((degrees % 360) + 360) % 360;
export const isRotated = (span: Span) => Math.min(normalizeAngle(span.rotation ?? 0), 360 - normalizeAngle(span.rotation ?? 0)) > 0.5;
export const verticalTextFlow = (angle: number) => Math.abs(normalizeAngle(angle) - 90) < 0.5 ? 'vert'
  : Math.abs(normalizeAngle(angle) - 270) < 0.5 ? 'vert270' : 'horz';
/** Oblique text shears its axes; a rigid rotation keeps them perpendicular. */
export function isObliqueTransform(t: number[]) {
  const length = Math.hypot(t[0], t[1]) * Math.hypot(t[2], t[3]);
  return length > 0 && Math.abs(t[0] * t[2] + t[1] * t[3]) / length > 0.1;
}
export const lineHeight = (span: Span) => span.size * Math.max(1, (span.ascent ?? 0.8) + (span.descent ?? 0.2));
export const baselineOffset = (span: Span, height = lineHeight(span)) => height - span.size * (span.descent ?? 0.2);
export const textTop = (span: Span) => span.y - baselineOffset(span);

/** Position a rotated textbox by its centre; PDF supplies the baseline origin. */
export function textBoxGeometry(span: Span) {
  const angle = normalizeAngle(span.rotation ?? 0);
  const rad = angle * Math.PI / 180;
  const width = Math.max(1, span.width), height = lineHeight(span);
  const dy = height / 2 - baselineOffset(span, height);
  const cx = span.x + Math.cos(rad) * width / 2 - Math.sin(rad) * dy;
  const cy = span.y + Math.sin(rad) * width / 2 + Math.cos(rad) * dy;
  return { x: cx - width / 2, y: cy - height / 2, width, height, angle };
}
