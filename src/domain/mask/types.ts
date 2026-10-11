/** All coordinates are normalized to the stored (EXIF-baked, resized) image: u = x/W, v = y/H. */
export type StrokeShape = { t: 'stroke'; w: number; p: number[] };
export type RectShape = { t: 'rect'; x: number; y: number; w: number; h: number };
export type PolyShape = { t: 'poly'; p: number[] };
export type Shape = StrokeShape | RectShape | PolyShape;
export type MaskGeometry = { v: 1; shapes: Shape[] };

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
/** Normalized bounding box (0..1). */
export type BBox = { x: number; y: number; w: number; h: number };

export type Mask = { id: string; ord: number; geometry: MaskGeometry; bbox: BBox };
