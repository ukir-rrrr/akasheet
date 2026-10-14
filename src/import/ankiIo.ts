import type { PolyShape, RectShape, Shape } from '@/domain/mask/types';

const CLOZE_RE = /\{\{c(\d+)::image-occlusion:(rect|poly)(:[^}]+)?\}\}/gi;

function parseKv(segment: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of segment.split(':')) {
    const i = part.indexOf('=');
    if (i <= 0) continue;
    out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

/** Anki IO enhanced uses 0–100 % of image size; convert to normalized 0–1. */
function pct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n > 1.5) return Math.min(1, Math.max(0, n / 100));
  return Math.min(1, Math.max(0, n));
}

function rectFromKv(kv: Record<string, string>): RectShape | null {
  const left = Number(kv.left);
  const top = Number(kv.top);
  const width = Number(kv.width);
  const height = Number(kv.height);
  if (![left, top, width, height].every(Number.isFinite)) return null;
  const x = pct(left);
  const y = pct(top);
  const w = pct(width);
  const h = pct(height);
  if (w <= 0 || h <= 0) return null;
  return { t: 'rect', x, y, w, h };
}

function polyFromKv(kv: Record<string, string>): PolyShape | null {
  const raw = kv.points ?? kv.point;
  if (!raw) return null;
  const nums = raw
    .split(/[, ]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  if (nums.length < 6 || nums.length % 2 !== 0) return null;
  const p: number[] = [];
  for (let i = 0; i < nums.length; i += 2) {
    p.push(pct(nums[i]), pct(nums[i + 1]));
  }
  return { t: 'poly', p };
}

export type ParsedIoCloze = { index: number; shapes: Shape[] };

/** Parses Anki 23.10+ image occlusion clozes into one shape group per `cN`. */
export function parseImageOcclusionField(text: string): ParsedIoCloze[] {
  const byIndex = new Map<number, Shape[]>();
  let m: RegExpExecArray | null;
  CLOZE_RE.lastIndex = 0;
  while ((m = CLOZE_RE.exec(text)) !== null) {
    const index = Number(m[1]);
    const kind = m[2].toLowerCase();
    const kv = parseKv(m[3] ?? '');
    const shape = kind === 'rect' ? rectFromKv(kv) : polyFromKv(kv);
    if (!shape) continue;
    byIndex.set(index, [...(byIndex.get(index) ?? []), shape]);
  }
  return [...byIndex.entries()].sort(([a], [b]) => a - b).map(([index, shapes]) => ({ index, shapes }));
}

export function maskGeometriesFromIo(
  clozes: ParsedIoCloze[],
): { ord: number; geometry: { v: 1; shapes: Shape[] } }[] {
  return clozes
    .filter((c) => c.shapes.length > 0)
    .map((c) => ({ ord: c.index, geometry: { v: 1 as const, shapes: c.shapes } }));
}

const IMG_SRC_RE = /<img[^>]+src=["']([^"']+)["']/i;

export function extractImageFileName(html: string): string | null {
  const m = IMG_SRC_RE.exec(html);
  if (!m) return null;
  const src = m[1].trim();
  const base = src.split(/[?#]/)[0].split('/').pop();
  return base && base.length > 0 ? base : null;
}
