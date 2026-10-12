import { Skia, StrokeCap, StrokeJoin, type SkPath } from '@shopify/react-native-skia';

import type { BBox, MaskGeometry, Point, Shape, Size } from '@/domain/mask/types';

/** Fill outline (image px) for one shape; strokes are expanded with round caps/joins. */
export function shapePath(s: Shape, img: Size): SkPath {
  const b = Skia.PathBuilder.Make();
  if (s.t === 'rect') {
    b.addRect(Skia.XYWHRect(s.x * img.width, s.y * img.height, s.w * img.width, s.h * img.height));
    return b.build();
  }
  const n = s.p.length / 2;
  if (s.t === 'stroke') {
    const width = s.w * Math.max(img.width, img.height);
    if (n === 1) {
      b.addCircle(s.p[0] * img.width, s.p[1] * img.height, width / 2);
      return b.build();
    }
    b.moveTo(s.p[0] * img.width, s.p[1] * img.height);
    for (let i = 1; i < n; i++) b.lineTo(s.p[i * 2] * img.width, s.p[i * 2 + 1] * img.height);
    const centerline = b.build();
    return (
      Skia.Path.Stroke(centerline, { width, cap: StrokeCap.Round, join: StrokeJoin.Round }) ?? centerline
    );
  }
  b.moveTo(s.p[0] * img.width, s.p[1] * img.height);
  for (let i = 1; i < n; i++) b.lineTo(s.p[i * 2] * img.width, s.p[i * 2 + 1] * img.height);
  b.close();
  return b.build();
}

/** One independent path per mask (never merged across masks, so overlaps do not punch holes). */
export function maskPath(g: MaskGeometry, img: Size): SkPath {
  const b = Skia.PathBuilder.Make();
  for (const s of g.shapes) b.addPath(shapePath(s, img));
  return b.build();
}

/** 45° hatch lines covering a bbox (image px), spaced `gap` px apart. */
export function hatchPath(b: BBox, img: Size, gap: number): SkPath {
  const builder = Skia.PathBuilder.Make();
  const x0 = b.x * img.width;
  const y0 = b.y * img.height;
  const w = b.w * img.width;
  const h = b.h * img.height;
  for (let d = -h; d < w; d += gap) {
    builder.moveTo(x0 + d, y0 + h);
    builder.lineTo(x0 + d + h, y0);
  }
  return builder.build();
}

export function polylinePath(points: readonly Point[]): SkPath {
  const b = Skia.PathBuilder.Make();
  if (points.length === 0) return b.build();
  b.moveTo(points[0].x, points[0].y);
  if (points.length === 1) b.lineTo(points[0].x + 0.01, points[0].y);
  for (let i = 1; i < points.length; i++) b.lineTo(points[i].x, points[i].y);
  return b.build();
}
