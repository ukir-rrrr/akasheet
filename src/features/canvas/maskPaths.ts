import { Skia, StrokeCap, StrokeJoin, type SkPath } from '@shopify/react-native-skia';

import type { BBox, MaskGeometry, Point, Shape, Size } from '@/domain/mask/types';

/** Fill outline (image px) for one shape; strokes are expanded with round caps/joins. */
export function shapePath(s: Shape, img: Size): SkPath {
  const path = Skia.Path.Make();
  if (s.t === 'rect') {
    path.addRect(Skia.XYWHRect(s.x * img.width, s.y * img.height, s.w * img.width, s.h * img.height));
    return path;
  }
  const n = s.p.length / 2;
  if (s.t === 'stroke') {
    const width = s.w * Math.max(img.width, img.height);
    if (n === 1) {
      path.addCircle(s.p[0] * img.width, s.p[1] * img.height, width / 2);
      return path;
    }
    path.moveTo(s.p[0] * img.width, s.p[1] * img.height);
    for (let i = 1; i < n; i++) path.lineTo(s.p[i * 2] * img.width, s.p[i * 2 + 1] * img.height);
    const stroked = path.copy();
    return stroked.stroke({ width, cap: StrokeCap.Round, join: StrokeJoin.Round }) ?? path;
  }
  path.moveTo(s.p[0] * img.width, s.p[1] * img.height);
  for (let i = 1; i < n; i++) path.lineTo(s.p[i * 2] * img.width, s.p[i * 2 + 1] * img.height);
  path.close();
  return path;
}

/** One independent path per mask (never merged across masks, so overlaps do not punch holes). */
export function maskPath(g: MaskGeometry, img: Size): SkPath {
  const path = Skia.Path.Make();
  for (const s of g.shapes) path.addPath(shapePath(s, img));
  return path;
}

/** 45° hatch lines covering a bbox (image px), spaced `gap` px apart. */
export function hatchPath(b: BBox, img: Size, gap: number): SkPath {
  const path = Skia.Path.Make();
  const x0 = b.x * img.width;
  const y0 = b.y * img.height;
  const w = b.w * img.width;
  const h = b.h * img.height;
  for (let d = -h; d < w; d += gap) {
    path.moveTo(x0 + d, y0 + h);
    path.lineTo(x0 + d + h, y0);
  }
  return path;
}

export function polylinePath(points: readonly Point[]): SkPath {
  const path = Skia.Path.Make();
  if (points.length === 0) return path;
  path.moveTo(points[0].x, points[0].y);
  if (points.length === 1) path.lineTo(points[0].x + 0.01, points[0].y);
  for (let i = 1; i < points.length; i++) path.lineTo(points[i].x, points[i].y);
  return path;
}
