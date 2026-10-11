import { distanceToSegment } from './simplify';
import type { BBox, MaskGeometry, Point, Shape, Size } from './types';

export type HitCandidate = { id: string; ord: number; geometry: MaskGeometry; bbox: BBox };

export type HitOptions = {
  /** Extra tolerance in image px (DESIGN: 8pt converted with 8/(s0·k)). */
  tolPx: number;
  /** Minimum touch target in image px (UI: 44pt). Small masks get their bbox expanded to this size. */
  minTargetPx: number;
  revealed: ReadonlySet<string>;
};

function pointInPolygon(pt: Point, p: number[], img: Size): boolean {
  let inside = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2] * img.width;
    const yi = p[i * 2 + 1] * img.height;
    const xj = p[j * 2] * img.width;
    const yj = p[j * 2 + 1] * img.height;
    if (yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToPolyline(pt: Point, p: number[], img: Size, closed: boolean): number {
  const n = p.length / 2;
  if (n === 1) return Math.hypot(pt.x - p[0] * img.width, pt.y - p[1] * img.height);
  let best = Infinity;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const a = { x: p[i * 2] * img.width, y: p[i * 2 + 1] * img.height };
    const b = { x: p[j * 2] * img.width, y: p[j * 2 + 1] * img.height };
    best = Math.min(best, distanceToSegment(pt, a, b));
  }
  return best;
}

export function shapeContains(s: Shape, pt: Point, img: Size, tolPx: number): boolean {
  switch (s.t) {
    case 'rect': {
      const x = s.x * img.width - tolPx;
      const y = s.y * img.height - tolPx;
      return (
        pt.x >= x &&
        pt.y >= y &&
        pt.x <= x + s.w * img.width + 2 * tolPx &&
        pt.y <= y + s.h * img.height + 2 * tolPx
      );
    }
    case 'stroke': {
      const halfW = (s.w * Math.max(img.width, img.height)) / 2;
      return distanceToPolyline(pt, s.p, img, false) <= halfW + tolPx;
    }
    case 'poly':
      return pointInPolygon(pt, s.p, img) || distanceToPolyline(pt, s.p, img, true) <= tolPx;
  }
}

function inExpandedBBox(b: BBox, pt: Point, img: Size, pad: number, minTarget: number): boolean {
  const w = b.w * img.width;
  const h = b.h * img.height;
  const cx = b.x * img.width + w / 2;
  const cy = b.y * img.height + h / 2;
  const hw = Math.max(w / 2 + pad, minTarget / 2);
  const hh = Math.max(h / 2 + pad, minTarget / 2);
  return Math.abs(pt.x - cx) <= hw && Math.abs(pt.y - cy) <= hh;
}

/**
 * Returns the id of the tapped mask or null. Unrevealed masks win over revealed ones; within a group the
 * front-most (largest ord) wins. If no shape is hit precisely, a small mask whose bbox expanded to the minimum
 * touch target contains the point is accepted. Taps that hit nothing never reveal anything.
 */
export function hitTest(
  masks: readonly HitCandidate[],
  pt: Point,
  img: Size,
  opts: HitOptions,
): string | null {
  const ordered = [...masks].sort((a, b) => {
    const ra = opts.revealed.has(a.id) ? 1 : 0;
    const rb = opts.revealed.has(b.id) ? 1 : 0;
    return ra - rb || b.ord - a.ord;
  });
  const coarse = ordered.filter((m) => inExpandedBBox(m.bbox, pt, img, opts.tolPx, opts.minTargetPx));
  for (const m of coarse) {
    if (m.geometry.shapes.some((s) => shapeContains(s, pt, img, opts.tolPx))) return m.id;
  }
  for (const m of coarse) {
    const small = m.bbox.w * img.width < opts.minTargetPx || m.bbox.h * img.height < opts.minTargetPx;
    if (small) return m.id;
  }
  return null;
}
