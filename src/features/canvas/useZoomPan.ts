import { useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';

import { clampZoomPan, fitContain, IDENTITY_ZOOM, zoomAround, type ZoomPan } from '@/domain/mask/transform';
import type { Point, Size } from '@/domain/mask/types';

/**
 * Canvas viewport state: contain-fit plus user zoom (1–6×). Two-finger pinch zooms around the focal point and
 * pans with it; double tap returns to the whole page. A layout change (rotation) resets the zoom.
 */
export function useZoomPan(img: Size | null) {
  const [view, setView] = useState<Size | null>(null);
  const [zp, setZp] = useState<ZoomPan>(IDENTITY_ZOOM);
  const base = useRef<{ zp: ZoomPan; focal: Point }>({ zp: IDENTITY_ZOOM, focal: { x: 0, y: 0 } });
  const fit = useMemo(() => (view && img ? fitContain(view, img) : null), [view, img]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (view && Math.abs(view.width - width) < 0.5 && Math.abs(view.height - height) < 0.5) return;
    setView({ width, height });
    setZp(IDENTITY_ZOOM);
  };

  // RNGH builder callbacks only run on gesture events (runOnJS), never during render.
  /* eslint-disable react-hooks/refs */
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onStart((e) => {
      base.current = { zp, focal: { x: e.focalX, y: e.focalY } };
    })
    .onUpdate((e) => {
      if (!view || !img || !fit) return;
      const b = base.current;
      const zoomed = zoomAround(b.zp, b.focal, b.zp.k * e.scale);
      const moved = { ...zoomed, tx: zoomed.tx + e.focalX - b.focal.x, ty: zoomed.ty + e.focalY - b.focal.y };
      setZp(clampZoomPan(moved, view, img, fit));
    });
  /* eslint-enable react-hooks/refs */

  const doubleTap = Gesture.Tap()
    .runOnJS(true)
    .numberOfTaps(2)
    .onEnd(() => setZp(IDENTITY_ZOOM));

  return { view, fit, zp, onLayout, pinch, doubleTap, reset: () => setZp(IDENTITY_ZOOM) };
}
