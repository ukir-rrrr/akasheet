import { z } from 'zod';

import type { MaskGeometry } from './types';

const unit = z.number().finite().min(0).max(1);
const coords = z.array(unit).refine((p) => p.length % 2 === 0, 'odd coordinate count');

const shapeSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('stroke'), w: unit.refine((w) => w > 0, 'w must be > 0'), p: coords.refine((p) => p.length >= 2) }),
  z.object({
    t: z.literal('rect'),
    x: unit,
    y: unit,
    w: unit.refine((w) => w > 0),
    h: unit.refine((h) => h > 0),
  }),
  z.object({ t: z.literal('poly'), p: coords.refine((p) => p.length >= 6) }),
]);

export const maskGeometrySchema = z.object({ v: z.literal(1), shapes: z.array(shapeSchema).min(1) });

export function encodeGeometry(g: MaskGeometry): string {
  return JSON.stringify(maskGeometrySchema.parse(g));
}

/** Returns null for invalid input so the caller can drop only that mask and still open the card. */
export function decodeGeometry(json: string): MaskGeometry | null {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return null;
  }
  const r = maskGeometrySchema.safeParse(raw);
  return r.success ? (r.data as MaskGeometry) : null;
}

export function isValidGeometry(g: unknown): g is MaskGeometry {
  return maskGeometrySchema.safeParse(g).success;
}
