import type { BBox } from './types';

/**
 * Reading order for masks: rows top→bottom, then left→right inside a row. A mask belongs to the current row
 * when its vertical center is within half of the row anchor's height from the anchor's center.
 * Returns the input indices in reading order.
 */
export function readingOrder(boxes: readonly BBox[]): number[] {
  const idx = boxes.map((_, i) => i).sort((a, b) => boxes[a].y - boxes[b].y || boxes[a].x - boxes[b].x);
  const rows: number[][] = [];
  for (const i of idx) {
    const row = rows[rows.length - 1];
    if (row) {
      const anchor = boxes[row[0]];
      const anchorCy = anchor.y + anchor.h / 2;
      const cy = boxes[i].y + boxes[i].h / 2;
      if (Math.abs(cy - anchorCy) <= anchor.h / 2) {
        row.push(i);
        continue;
      }
    }
    rows.push([i]);
  }
  return rows.flatMap((row) => row.sort((a, b) => boxes[a].x - boxes[b].x));
}
