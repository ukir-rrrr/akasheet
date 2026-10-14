import { decodeGeometry, isValidGeometry } from '@/domain/mask/codec';
import type { MaskGeometry, PolyShape, RectShape, Shape } from '@/domain/mask/types';

const CLOZE_RE = /\{\{c(\d+)::/gi;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function rectShape(x: number, y: number, w: number, h: number): RectShape | null {
  const rx = clamp01(x);
  const ry = clamp01(y);
  const rw = clamp01(w);
  const rh = clamp01(h);
  if (rw <= 0 || rh <= 0) return null;
  if (rx + rw > 1.0001 || ry + rh > 1.0001) return null;
  return { t: 'rect', x: rx, y: ry, w: rw, h: rh };
}

function polyShape(points: number[]): PolyShape | null {
  if (points.length < 6 || points.length % 2 !== 0) return null;
  const p = points.map(clamp01);
  return { t: 'poly', p };
}

function geometryFromShapes(shapes: Shape[]): MaskGeometry | null {
  if (shapes.length === 0) return null;
  const g: MaskGeometry = { v: 1, shapes };
  return isValidGeometry(g) ? g : null;
}

/** Parse CSV `masks` column: JSON array of MaskGeometry, or a single geometry object. */
export function parseCsvMasksColumn(raw: string): MaskGeometry[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }
  if (Array.isArray(parsed)) {
    return parsed.flatMap((item) => {
      if (isValidGeometry(item)) return [item];
      const decoded = typeof item === 'string' ? decodeGeometry(item) : null;
      return decoded ? [decoded] : [];
    });
  }
  if (isValidGeometry(parsed)) return [parsed];
  if (typeof parsed === 'string') {
    const d = decodeGeometry(parsed);
    return d ? [d] : [];
  }
  return [];
}

type ViewBox = { w: number; h: number };

function parseViewBox(svgOpen: string): ViewBox {
  const m = svgOpen.match(/viewBox\s*=\s*["']([^"']+)["']/i);
  if (!m) return { w: 1, h: 1 };
  const parts = m[1].trim().split(/\s+/).map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
    return { w: parts[2] > 0 ? parts[2] : 1, h: parts[3] > 0 ? parts[3] : 1 };
  }
  return { w: 1, h: 1 };
}

function normX(x: number, vb: ViewBox): number {
  return vb.w <= 1.01 ? clamp01(x) : clamp01(x / vb.w);
}

function normY(y: number, vb: ViewBox): number {
  return vb.h <= 1.01 ? clamp01(y) : clamp01(y / vb.h);
}

function normW(w: number, vb: ViewBox): number {
  return vb.w <= 1.01 ? clamp01(w) : clamp01(w / vb.w);
}

function normH(h: number, vb: ViewBox): number {
  return vb.h <= 1.01 ? clamp01(h) : clamp01(h / vb.h);
}

function clozeIndexFromAttrs(attrs: string): number | null {
  const m = attrs.match(/data-cloze\s*=\s*["']c?(\d+)["']/i) ?? attrs.match(/id\s*=\s*["']io-c(\d+)["']/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function shapesFromSvg(svg: string): Map<number, Shape[]> {
  const byCloze = new Map<number, Shape[]>();
  const open = svg.match(/<svg[^>]*>/i)?.[0] ?? '<svg>';
  const vb = parseViewBox(open);

  const rectRe = /<rect\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = rectRe.exec(svg))) {
    const attrs = m[1];
    const x = Number(attrs.match(/\bx\s*=\s*["']([^"']+)["']/i)?.[1]);
    const y = Number(attrs.match(/\by\s*=\s*["']([^"']+)["']/i)?.[1]);
    const w = Number(attrs.match(/\bwidth\s*=\s*["']([^"']+)["']/i)?.[1]);
    const h = Number(attrs.match(/\bheight\s*=\s*["']([^"']+)["']/i)?.[1]);
    const shape = rectShape(normX(x, vb), normY(y, vb), normW(w, vb), normH(h, vb));
    if (!shape) continue;
    const ci = clozeIndexFromAttrs(attrs) ?? 1;
    byCloze.set(ci, [...(byCloze.get(ci) ?? []), shape]);
  }

  const polyRe = /<polygon\b([^>]*)\/?>/gi;
  while ((m = polyRe.exec(svg))) {
    const attrs = m[1];
    const pts = attrs.match(/\bpoints\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!pts) continue;
    const nums = pts
      .trim()
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    const pairs: number[] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      pairs.push(normX(nums[i], vb), normY(nums[i + 1], vb));
    }
    const shape = polyShape(pairs);
    if (!shape) continue;
    const ci = clozeIndexFromAttrs(attrs) ?? 1;
    byCloze.set(ci, [...(byCloze.get(ci) ?? []), shape]);
  }

  return byCloze;
}

function occlusionMasksByCloze(html: string): Map<number, MaskGeometry> {
  const combined = new Map<number, Shape[]>();

  for (const svg of html.match(/<svg[\s\S]*?<\/svg>/gi) ?? []) {
    for (const [ci, shapes] of shapesFromSvg(svg)) {
      combined.set(ci, [...(combined.get(ci) ?? []), ...shapes]);
    }
  }

  const clozeNums = new Set<number>();
  let c: RegExpExecArray | null;
  const re = new RegExp(CLOZE_RE.source, 'gi');
  while ((c = re.exec(html))) {
    clozeNums.add(Number(c[1]));
  }
  if (clozeNums.size === 0 && combined.size > 0) {
    clozeNums.add(1);
  }

  const out = new Map<number, MaskGeometry>();
  const indices = [...new Set([...clozeNums, ...combined.keys()])].sort((a, b) => a - b);
  for (const ci of indices) {
    const g = geometryFromShapes(combined.get(ci) ?? []);
    if (g) out.set(ci, g);
  }
  return out;
}

/** Image Occlusion HTML → one mask per cloze (`cN`), sorted by cloze index. */
export function parseOcclusionMasks(html: string): MaskGeometry[] {
  return [...occlusionMasksByCloze(html).values()];
}

/** `ord` is Anki card.ord (0-based); maps to cloze `c(ord+1)`. */
export function occlusionMaskForOrd(html: string, ord: number): MaskGeometry | null {
  return occlusionMasksByCloze(html).get(ord + 1) ?? null;
}
