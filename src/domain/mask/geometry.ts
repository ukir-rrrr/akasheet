import { simplifyRdp } from './simplify';
import { clamp, round4 } from './transform';
import type { BBox, MaskGeometry, Point, RectShape, Shape, Size, StrokeShape } from './types';

export const RDP_EPSILON_PX = 0.75;
export const MAX_STROKE_POINTS = 2000;
export const MIN_POINT_SPACING_PT = 1.5;
export const MIN_STROKE_LENGTH_PT = 4;
export const MIN_RECT_SIDE_PT = 8;
export const MARKER_WIDTHS_PT = { s: 12, m: 20, l: 32 } as const;
export type MarkerSize = keyof typeof MARKER_WIDTHS_PT;

export function polylineLength(points: readonly Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/** Image-px points → simplified, clamped, 4-digit normalized stroke shape. */
export function buildStroke(pointsPx: readonly Point[], widthNorm: number, img: Size): StrokeShape {
  const simplified = simplifyRdp(pointsPx, RDP_EPSILON_PX);
  const p: number[] = [];
  for (const pt of simplified) {
    p.push(round4(clamp(pt.x / img.width, 0, 1)), round4(clamp(pt.y / img.height, 0, 1)));
  }
  return { t: 'stroke', w: Math.max(0.0001, round4(widthNorm)), p };
}

/** Two image-px corners → normalized, clamped rect shape. */
export function buildRect(a: Point, b: Point, img: Size): RectShape {
  const x0 = clamp(Math.min(a.x, b.x) / img.width, 0, 1);
  const y0 = clamp(Math.min(a.y, b.y) / img.height, 0, 1);
  const x1 = clamp(Math.max(a.x, b.x) / img.width, 0, 1);
  const y1 = clamp(Math.max(a.y, b.y) / img.height, 0, 1);
  return { t: 'rect', x: round4(x0), y: round4(y0), w: round4(x1 - x0), h: round4(y1 - y0) };
}

function shapeBounds(s: Shape, img: Size): [number, number, number, number] {
  if (s.t === 'rect') return [s.x, s.y, s.x + s.w, s.y + s.h];
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (let i = 0; i < s.p.length; i += 2) {
    minX = Math.min(minX, s.p[i]);
    maxX = Math.max(maxX, s.p[i]);
    minY = Math.min(minY, s.p[i + 1]);
    maxY = Math.max(maxY, s.p[i + 1]);
  }
  if (s.t === 'stroke') {
    const halfPx = (s.w * Math.max(img.width, img.height)) / 2;
    const hx = halfPx / img.width;
    const hy = halfPx / img.height;
    return [minX - hx, minY - hy, maxX + hx, maxY + hy];
  }
  return [minX, minY, maxX, maxY];
}

export function geometryBBox(g: MaskGeometry, img: Size): BBox {
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  for (const s of g.shapes) {
    const [a, b, c, d] = shapeBounds(s, img);
    x0 = Math.min(x0, a);
    y0 = Math.min(y0, b);
    x1 = Math.max(x1, c);
    y1 = Math.max(y1, d);
  }
  x0 = clamp(x0, 0, 1);
  y0 = clamp(y0, 0, 1);
  x1 = clamp(x1, 0, 1);
  y1 = clamp(y1, 0, 1);
  return { x: round4(x0), y: round4(y0), w: round4(Math.max(0, x1 - x0)), h: round4(Math.max(0, y1 - y0)) };
}
