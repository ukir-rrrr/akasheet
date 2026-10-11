import type { Point, Size } from './types';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;

/** contain-fit of the image inside the canvas: scale s0 and letterbox offset (ox, oy). */
export type Fit = { s0: number; ox: number; oy: number };
/** User zoom k ∈ [1, 6] and pan T (screen points). */
export type ZoomPan = { k: number; tx: number; ty: number };

export const IDENTITY_ZOOM: ZoomPan = { k: 1, tx: 0, ty: 0 };

export function fitContain(view: Size, img: Size): Fit {
  const s0 = Math.min(view.width / img.width, view.height / img.height);
  return { s0, ox: (view.width - img.width * s0) / 2, oy: (view.height - img.height * s0) / 2 };
}

/** image px → screen: S = T + k·(O + s0·P) */
export function imageToScreen(p: Point, fit: Fit, zp: ZoomPan): Point {
  return { x: zp.tx + zp.k * (fit.ox + fit.s0 * p.x), y: zp.ty + zp.k * (fit.oy + fit.s0 * p.y) };
}

/** screen → image px: P = ((S − T)/k − O) / s0 */
export function screenToImage(s: Point, fit: Fit, zp: ZoomPan): Point {
  return { x: ((s.x - zp.tx) / zp.k - fit.ox) / fit.s0, y: ((s.y - zp.ty) / zp.k - fit.oy) / fit.s0 };
}

export function imageToNorm(p: Point, img: Size): Point {
  return { x: p.x / img.width, y: p.y / img.height };
}

export function normToImage(p: Point, img: Size): Point {
  return { x: p.x * img.width, y: p.y * img.height };
}

/** Screen-point length → image px. */
export function screenLenToImage(len: number, fit: Fit, k: number): number {
  return len / (fit.s0 * k);
}

/** Screen stroke width → normalized width (divided by the long side so u/v anisotropy does not matter). */
export function screenWidthToNorm(wScreen: number, fit: Fit, k: number, img: Size): number {
  return screenLenToImage(wScreen, fit, k) / Math.max(img.width, img.height);
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function isInsideImage(p: Point, img: Size): boolean {
  return p.x >= 0 && p.y >= 0 && p.x <= img.width && p.y <= img.height;
}

/**
 * Clamp zoom to [1, 6] and pan so that at least `minVisible` screen points of the image remain on screen.
 * At k=1 the pan is reset so the image stays centered.
 */
export function clampZoomPan(zp: ZoomPan, view: Size, img: Size, fit: Fit, minVisible = 64): ZoomPan {
  const k = clamp(zp.k, MIN_ZOOM, MAX_ZOOM);
  if (k === 1) return IDENTITY_ZOOM;
  const left = k * fit.ox;
  const top = k * fit.oy;
  const w = k * fit.s0 * img.width;
  const h = k * fit.s0 * img.height;
  const minVis = Math.min(minVisible, w, h);
  const tx = clamp(zp.tx, minVis - left - w, view.width - minVis - left);
  const ty = clamp(zp.ty, minVis - top - h, view.height - minVis - top);
  return { k, tx, ty };
}

/** Zoom around a focal screen point so the image point under the focal stays fixed. */
export function zoomAround(zp: ZoomPan, focal: Point, nextK: number): ZoomPan {
  const k = clamp(nextK, MIN_ZOOM, MAX_ZOOM);
  const r = k / zp.k;
  return { k, tx: focal.x - (focal.x - zp.tx) * r, ty: focal.y - (focal.y - zp.ty) * r };
}
