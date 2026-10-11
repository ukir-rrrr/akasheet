import fc from 'fast-check';

import { decodeGeometry, encodeGeometry, isValidGeometry } from './codec';
import { buildRect, buildStroke, geometryBBox, polylineLength, RDP_EPSILON_PX } from './geometry';
import { hitTest, shapeContains, type HitCandidate } from './hitTest';
import { readingOrder } from './order';
import { distanceToSegment, simplifyRdp } from './simplify';
import {
  clampZoomPan,
  fitContain,
  IDENTITY_ZOOM,
  imageToNorm,
  imageToScreen,
  isInsideImage,
  normToImage,
  round4,
  screenToImage,
  screenWidthToNorm,
  zoomAround,
} from './transform';
import type { MaskGeometry, Point, Size } from './types';

describe('transform', () => {
  const sizes = fc.record({
    width: fc.integer({ min: 100, max: 4000 }),
    height: fc.integer({ min: 100, max: 4000 }),
  });

  // Rounding error is 0.5e-4 × displayed size; device screens (≤1400pt) at ≤6x zoom stay under 0.5pt.
  const screens = fc.record({
    width: fc.integer({ min: 100, max: 1400 }),
    height: fc.integer({ min: 100, max: 1400 }),
  });

  it('screen → normalized (4 digits) → screen round-trips within 0.5pt', () => {
    fc.assert(
      fc.property(
        screens,
        sizes,
        fc.constantFrom(1, 2, 6),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (view, img, k, a, b) => {
          const fit = fitContain(view, img);
          const zp = { k, tx: -a * 50, ty: -b * 50 };
          const s = imageToScreen({ x: a * img.width, y: b * img.height }, fit, zp);
          const n = imageToNorm(screenToImage(s, fit, zp), img);
          const back = imageToScreen(normToImage({ x: round4(n.x), y: round4(n.y) }, img), fit, zp);
          expect(Math.abs(back.x - s.x)).toBeLessThanOrEqual(0.5 + 1e-9);
          expect(Math.abs(back.y - s.y)).toBeLessThanOrEqual(0.5 + 1e-9);
        },
      ),
    );
  });

  it('letterboxes portrait and landscape images', () => {
    expect(fitContain({ width: 400, height: 400 }, { width: 200, height: 100 })).toEqual({
      s0: 2,
      ox: 0,
      oy: 100,
    });
    expect(fitContain({ width: 400, height: 400 }, { width: 100, height: 200 })).toEqual({
      s0: 2,
      ox: 100,
      oy: 0,
    });
  });

  it('converts screen widths to long-side-normalized widths', () => {
    const fit = fitContain({ width: 390, height: 520 }, { width: 1500, height: 2000 });
    expect(screenWidthToNorm(20, fit, 1, { width: 1500, height: 2000 })).toBeCloseTo(20 / 0.26 / 2000, 8);
    expect(screenWidthToNorm(20, fit, 2, { width: 1500, height: 2000 })).toBeCloseTo(10 / 0.26 / 2000, 8);
  });

  it('clamps zoom and keeps 64pt of the image visible', () => {
    const view = { width: 400, height: 400 };
    const img = { width: 400, height: 400 };
    const fit = fitContain(view, img);
    expect(clampZoomPan({ k: 0.5, tx: 99, ty: 99 }, view, img, fit)).toEqual(IDENTITY_ZOOM);
    expect(clampZoomPan({ k: 10, tx: 0, ty: 0 }, view, img, fit).k).toBe(6);
    const far = clampZoomPan({ k: 2, tx: -5000, ty: 5000 }, view, img, fit);
    expect(far.tx).toBe(64 - 800);
    expect(far.ty).toBe(400 - 64);
  });

  it('zooms around a focal point', () => {
    const zp = zoomAround(IDENTITY_ZOOM, { x: 100, y: 50 }, 2);
    expect(zp).toEqual({ k: 2, tx: -100, ty: -50 });
    expect(zoomAround(zp, { x: 0, y: 0 }, 99).k).toBe(6);
  });

  it('detects points outside the image', () => {
    expect(isInsideImage({ x: -1, y: 5 }, { width: 10, height: 10 })).toBe(false);
    expect(isInsideImage({ x: 10, y: 10 }, { width: 10, height: 10 })).toBe(true);
  });
});

describe('simplify (RDP)', () => {
  it('keeps endpoints and max deviation ≤ ε', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            x: fc.double({ min: 0, max: 500, noNaN: true }),
            y: fc.double({ min: 0, max: 500, noNaN: true }),
          }),
          {
            minLength: 2,
            maxLength: 200,
          },
        ),
        (pts) => {
          const out = simplifyRdp(pts, RDP_EPSILON_PX);
          expect(out[0]).toEqual(pts[0]);
          expect(out[out.length - 1]).toEqual(pts[pts.length - 1]);
          // every dropped point lies within ε of the simplified segment that spans it
          let seg = 0;
          const keptIdx = out.map((p) => pts.indexOf(p));
          for (let i = 0; i < pts.length; i++) {
            while (seg < keptIdx.length - 2 && i > keptIdx[seg + 1]) seg++;
            const a = pts[keptIdx[seg]];
            const b = pts[keptIdx[Math.min(seg + 1, keptIdx.length - 1)]];
            expect(distanceToSegment(pts[i], a, b)).toBeLessThanOrEqual(RDP_EPSILON_PX + 1e-9);
          }
        },
      ),
    );
  });

  it('collapses a straight line to its endpoints', () => {
    const line = Array.from({ length: 300 }, (_, i) => ({ x: i, y: 2 * i }));
    expect(simplifyRdp(line, 0.75)).toEqual([line[0], line[299]]);
    expect(simplifyRdp(line.slice(0, 1), 0.75)).toEqual([line[0]]);
  });

  it('measures distance to a degenerate segment', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
});

describe('geometry', () => {
  const img: Size = { width: 1000, height: 2000 };

  it('builds normalized, clamped strokes', () => {
    const s = buildStroke(
      [
        { x: -10, y: 100 },
        { x: 500, y: 100 },
        { x: 1200, y: 100 },
      ],
      0.01,
      img,
    );
    expect(s).toEqual({ t: 'stroke', w: 0.01, p: [0, 0.05, 1, 0.05] });
    expect(
      polylineLength([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ]),
    ).toBe(5);
  });

  it('builds rects from any two corners', () => {
    expect(buildRect({ x: 600, y: 1000 }, { x: 100, y: 200 }, img)).toEqual({
      t: 'rect',
      x: 0.1,
      y: 0.1,
      w: 0.5,
      h: 0.4,
    });
  });

  it('computes bbox including stroke half width in px of the long side', () => {
    const g: MaskGeometry = { v: 1, shapes: [{ t: 'stroke', w: 0.01, p: [0.5, 0.5] }] };
    // half width = 0.01*2000/2 = 10px → 0.01 in u, 0.005 in v
    expect(geometryBBox(g, img)).toEqual({ x: 0.49, y: 0.495, w: 0.02, h: 0.01 });
    const poly: MaskGeometry = {
      v: 1,
      shapes: [
        { t: 'poly', p: [0.1, 0.1, 0.3, 0.1, 0.2, 0.4] },
        { t: 'rect', x: 0.5, y: 0.5, w: 0.1, h: 0.1 },
      ],
    };
    expect(geometryBBox(poly, img)).toEqual({ x: 0.1, y: 0.1, w: 0.5, h: 0.5 });
  });
});

describe('hitTest', () => {
  const img: Size = { width: 1000, height: 1000 };
  const rect = (id: string, ord: number, x: number, y: number, w: number, h: number): HitCandidate => ({
    id,
    ord,
    geometry: { v: 1, shapes: [{ t: 'rect', x, y, w, h }] },
    bbox: { x, y, w, h },
  });
  const opts = (revealed: string[] = []) => ({ tolPx: 8, minTargetPx: 44, revealed: new Set(revealed) });

  it('hits stroke within half width + tolerance and misses beyond', () => {
    const stroke: HitCandidate = {
      id: 's',
      ord: 0,
      geometry: { v: 1, shapes: [{ t: 'stroke', w: 0.02, p: [0.1, 0.5, 0.9, 0.5] }] },
      bbox: { x: 0.1, y: 0.49, w: 0.8, h: 0.02 },
    };
    const precise = { ...opts(), minTargetPx: 0 };
    expect(hitTest([stroke], { x: 500, y: 500 + 10 + 8 }, img, precise)).toBe('s');
    expect(hitTest([stroke], { x: 500, y: 500 + 10 + 8.5 }, img, precise)).toBeNull();
    // a thin stroke is still tappable within the 44pt minimum target
    expect(hitTest([stroke], { x: 500, y: 521 }, img, opts())).toBe('s');
    expect(hitTest([stroke], { x: 500, y: 523 }, img, opts())).toBeNull();
  });

  it('expands rect by tolerance at the corners', () => {
    const r = rect('r', 0, 0.2, 0.2, 0.2, 0.2);
    expect(hitTest([r], { x: 192, y: 192 }, img, opts())).toBe('r');
    expect(hitTest([r], { x: 191, y: 191 }, img, opts())).toBeNull();
  });

  it('prefers unrevealed, then the front-most mask', () => {
    const a = rect('a', 0, 0.1, 0.1, 0.5, 0.5);
    const b = rect('b', 1, 0.2, 0.2, 0.5, 0.5);
    expect(hitTest([a, b], { x: 300, y: 300 }, img, opts())).toBe('b');
    expect(hitTest([a, b], { x: 300, y: 300 }, img, opts(['b']))).toBe('a');
    expect(hitTest([a, b], { x: 300, y: 300 }, img, opts(['a', 'b']))).toBe('b');
  });

  it('expands tiny masks to the minimum touch target', () => {
    const tiny = rect('t', 0, 0.5, 0.5, 0.004, 0.004);
    expect(hitTest([tiny], { x: 520, y: 502 }, img, opts())).toBe('t');
    expect(hitTest([tiny], { x: 540, y: 502 }, img, opts())).toBeNull();
  });

  it('handles polygons (inside and near edges)', () => {
    const tri = { t: 'poly' as const, p: [0.1, 0.1, 0.5, 0.1, 0.3, 0.5] };
    expect(shapeContains(tri, { x: 300, y: 200 }, img, 0)).toBe(true);
    expect(shapeContains(tri, { x: 300, y: 95 }, img, 8)).toBe(true);
    expect(shapeContains(tri, { x: 600, y: 600 }, img, 8)).toBe(false);
    const dot = { t: 'stroke' as const, w: 0.01, p: [0.5, 0.5] };
    expect(shapeContains(dot, { x: 505, y: 500 }, img, 0)).toBe(true);
  });

  it('does nothing for taps on empty areas', () => {
    expect(hitTest([rect('a', 0, 0.1, 0.1, 0.1, 0.1)], { x: 900, y: 900 }, img, opts())).toBeNull();
  });
});

describe('readingOrder', () => {
  it('orders rows top→bottom and left→right within a row', () => {
    const boxes = [
      { x: 0.6, y: 0.11, w: 0.1, h: 0.04 },
      { x: 0.1, y: 0.5, w: 0.2, h: 0.04 },
      { x: 0.1, y: 0.1, w: 0.1, h: 0.04 },
      { x: 0.4, y: 0.12, w: 0.1, h: 0.04 },
    ];
    expect(readingOrder(boxes)).toEqual([2, 3, 0, 1]);
  });
});

describe('codec', () => {
  const g: MaskGeometry = {
    v: 1,
    shapes: [
      { t: 'stroke', w: 0.01, p: [0.1, 0.2, 0.3, 0.4] },
      { t: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.2 },
    ],
  };

  it('round-trips valid geometry', () => {
    expect(decodeGeometry(encodeGeometry(g))).toEqual(g);
    expect(isValidGeometry(g)).toBe(true);
  });

  it.each([
    ['out of range', { v: 1, shapes: [{ t: 'rect', x: 1.2, y: 0, w: 0.1, h: 0.1 }] }],
    ['odd length', { v: 1, shapes: [{ t: 'stroke', w: 0.01, p: [0.1, 0.2, 0.3] }] }],
    ['unknown version', { v: 2, shapes: [{ t: 'rect', x: 0, y: 0, w: 0.1, h: 0.1 }] }],
    ['zero width', { v: 1, shapes: [{ t: 'stroke', w: 0, p: [0.1, 0.2] }] }],
    ['short poly', { v: 1, shapes: [{ t: 'poly', p: [0.1, 0.2, 0.3, 0.4] }] }],
    ['no shapes', { v: 1, shapes: [] }],
  ])('rejects %s', (_name, bad) => {
    expect(decodeGeometry(JSON.stringify(bad))).toBeNull();
  });

  it('rejects malformed JSON', () => {
    expect(decodeGeometry('{nope')).toBeNull();
  });
});

describe('integration: drawn stroke stays aligned', () => {
  it('maps a screen stroke to the same screen position after re-layout', () => {
    const img = { width: 1536, height: 2048 };
    const fitA = fitContain({ width: 390, height: 600 }, img);
    const screenPts: Point[] = [
      { x: 100, y: 200 },
      { x: 200, y: 200 },
    ];
    const px = screenPts.map((p) => screenToImage(p, fitA, IDENTITY_ZOOM));
    const stroke = buildStroke(px, screenWidthToNorm(20, fitA, 1, img), img);
    const fitB = fitContain({ width: 600, height: 390 }, img);
    const a = imageToScreen(normToImage({ x: stroke.p[0], y: stroke.p[1] }, img), fitB, IDENTITY_ZOOM);
    const expected = imageToScreen(px[0], fitB, IDENTITY_ZOOM);
    expect(Math.abs(a.x - expected.x)).toBeLessThan(0.5);
  });
});
