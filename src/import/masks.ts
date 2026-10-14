import { isValidGeometry, maskGeometrySchema } from '@/domain/mask/codec';
import type { MaskGeometry } from '@/domain/mask/types';

/** Parses masks from CSV / Anki note fields into Akasheet geometry (rect / poly). */
export function parseMasksField(raw: string): MaskGeometry[] {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return [];

  try {
    const json = JSON.parse(trimmed) as unknown;
    if (isValidGeometry(json)) return [json];
    if (Array.isArray(json)) {
      const shapes = json.filter((s) => typeof s === 'object' && s !== null);
      if (shapes.length === 0) return [];
      const wrapped = { v: 1 as const, shapes };
      if (maskGeometrySchema.safeParse(wrapped).success) return [wrapped as MaskGeometry];
    }
    if (typeof json === 'object' && json !== null && 'shapes' in json) {
      const g = json as MaskGeometry;
      if (isValidGeometry(g)) return [g];
    }
  } catch {
    // fall through to mini-DSL
  }

  const geoms: MaskGeometry[] = [];
  for (const part of trimmed.split(';')) {
    const seg = part.trim();
    if (!seg) continue;
    const rect = seg.match(/^rect:([0-9.]+),([0-9.]+),([0-9.]+),([0-9.]+)$/i);
    if (rect) {
      geoms.push({
        v: 1,
        shapes: [
          {
            t: 'rect',
            x: Number(rect[1]),
            y: Number(rect[2]),
            w: Number(rect[3]),
            h: Number(rect[4]),
          },
        ],
      });
      continue;
    }
    const poly = seg.match(/^poly:([0-9.,]+)$/i);
    if (poly) {
      const coords = poly[1].split(',').map((n) => Number(n.trim()));
      if (coords.length >= 6 && coords.length % 2 === 0) {
        geoms.push({ v: 1, shapes: [{ t: 'poly', p: coords }] });
      }
    }
  }
  return geoms;
}

/** Image Occlusion style: one card ↔ one mask (`cN` → shapes[ord]). */
export function masksForCardOrd(all: MaskGeometry[], ord: number): MaskGeometry[] {
  if (all.length === 0) return [];
  if (all.length === 1) return all;
  const pick = all[ord] ?? all[0];
  return [pick];
}

export function firstImageFileFromHtml(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m?.[1] ?? null;
}
