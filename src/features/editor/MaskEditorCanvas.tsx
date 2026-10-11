import { Canvas, Circle, Group, Image, Path, Rect, useImage } from '@shopify/react-native-skia';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import {
  buildRect,
  buildStroke,
  MARKER_WIDTHS_PT,
  MAX_STROKE_POINTS,
  MIN_POINT_SPACING_PT,
  MIN_RECT_SIDE_PT,
  MIN_STROKE_LENGTH_PT,
  polylineLength,
} from '@/domain/mask/geometry';
import { hitTest } from '@/domain/mask/hitTest';
import { imageToScreen, isInsideImage, screenToImage, screenWidthToNorm } from '@/domain/mask/transform';
import type { Point, Shape, Size } from '@/domain/mask/types';
import { EditMaskLayer, ReviewMaskLayer, useMaskPaths } from '@/features/canvas/MaskLayer';
import { polylinePath } from '@/features/canvas/maskPaths';
import { useZoomPan } from '@/features/canvas/useZoomPan';
import { AppText, Icon, PressableScale } from '@/ui/primitives';
import { radius, useTheme } from '@/ui/theme';

import type { EditorState } from './editorReducer';

type Live = { kind: 'stroke'; points: Point[]; widthPt: number } | { kind: 'rect'; a: Point; b: Point };

export function MaskEditorCanvas({
  uri,
  img,
  state,
  onShape,
  onSelect,
  onDeleteSelected,
  onPreviewTap,
}: {
  /** SkImage must not be passed as a prop: React dev tooling deep-diffs props and walks into CanvasKit. */
  uri: string;
  img: Size;
  state: EditorState;
  onShape: (s: Shape) => void;
  onSelect: (id: string | null) => void;
  onDeleteSelected: () => void;
  onPreviewTap: (id: string) => void;
}) {
  const { c } = useTheme();
  const image = useImage(uri);
  const { view, fit, zp, onLayout, pinch, doubleTap } = useZoomPan(img);
  const [live, setLiveState] = useState<Live | null>(null);
  const liveRef = useRef<Live | null>(null);
  const setLive = (l: Live | null) => {
    liveRef.current = l;
    setLiveState(l);
  };
  const [finger, setFinger] = useState<Point | null>(null);
  const cancelled = useRef(false);
  const widthNorm = useRef(0);
  const paths = useMaskPaths(state.masks, img);
  const scale = fit ? fit.s0 * zp.k : 1;

  const drawing = !state.preview && state.tool !== 'select';

  const cancel = () => {
    cancelled.current = true;
    setLive(null);
    setFinger(null);
  };

  const begin = (x: number, y: number) => {
    cancelled.current = false;
    if (!fit) return;
    const p = { x, y };
    // Strokes that start in the letterbox are ignored.
    if (!isInsideImage(screenToImage(p, fit, zp), img)) {
      cancelled.current = true;
      return;
    }
    setFinger(p);
    if (state.tool === 'rect') {
      setLive({ kind: 'rect', a: p, b: p });
    } else {
      const widthPt = MARKER_WIDTHS_PT[state.size];
      widthNorm.current = screenWidthToNorm(widthPt, fit, zp.k, img);
      setLive({ kind: 'stroke', points: [p], widthPt });
    }
  };

  const move = (x: number, y: number) => {
    if (cancelled.current) return;
    const p = { x, y };
    setFinger(p);
    const l = liveRef.current;
    if (!l) return;
    if (l.kind === 'rect') {
      setLive({ ...l, b: p });
      return;
    }
    const last = l.points[l.points.length - 1];
    if (l.points.length >= MAX_STROKE_POINTS || Math.hypot(p.x - last.x, p.y - last.y) < MIN_POINT_SPACING_PT)
      return;
    setLive({ ...l, points: [...l.points, p] });
  };

  const finish = () => {
    const l = liveRef.current;
    setLive(null);
    setFinger(null);
    if (cancelled.current || !l || !fit) return;
    if (l.kind === 'rect') {
      if (Math.abs(l.b.x - l.a.x) < MIN_RECT_SIDE_PT || Math.abs(l.b.y - l.a.y) < MIN_RECT_SIDE_PT) return;
      onShape(buildRect(screenToImage(l.a, fit, zp), screenToImage(l.b, fit, zp), img));
      return;
    }
    if (polylineLength(l.points) < MIN_STROKE_LENGTH_PT) return;
    onShape(
      buildStroke(
        l.points.map((p) => screenToImage(p, fit, zp)),
        widthNorm.current,
        img,
      ),
    );
  };

  // RNGH builder callbacks only run on gesture events (runOnJS), never during render.
  /* eslint-disable react-hooks/refs */
  const draw = Gesture.Pan()
    .runOnJS(true)
    .enabled(drawing)
    .minDistance(0)
    .maxPointers(1)
    .onTouchesDown((e) => {
      // A second finger means pinch: drop the stroke in progress instead of committing it.
      if (e.numberOfTouches > 1) cancel();
    })
    .onBegin((e) => begin(e.x, e.y))
    .onUpdate((e) => move(e.x, e.y))
    .onEnd((_e, success) => (success ? finish() : cancel()))
    .onFinalize((_e, success) => {
      if (!success) cancel();
    });
  /* eslint-enable react-hooks/refs */

  const tap = Gesture.Tap()
    .runOnJS(true)
    .enabled(!drawing)
    .onEnd((e) => {
      if (!fit) return;
      const pt = screenToImage({ x: e.x, y: e.y }, fit, zp);
      const candidates = state.masks.map((m, i) => ({
        id: m.id,
        ord: i,
        geometry: m.geometry,
        bbox: paths[i].bbox,
      }));
      const revealed = new Set(state.preview ? state.previewRevealed : []);
      const id = hitTest(candidates, pt, img, { tolPx: 8 / scale, minTargetPx: 44 / scale, revealed });
      if (state.preview) {
        if (id) onPreviewTap(id);
      } else {
        onSelect(id);
      }
    });

  const gesture = Gesture.Simultaneous(pinch, draw, Gesture.Exclusive(doubleTap, tap));

  const selected = paths.find((p) => p.id === state.selectedId);
  const handle =
    selected && fit
      ? imageToScreen(
          { x: (selected.bbox.x + selected.bbox.w) * img.width, y: selected.bbox.y * img.height },
          fit,
          zp,
        )
      : null;

  return (
    <View
      style={[styles.stage, { backgroundColor: c.canvas }]}
      onLayout={onLayout}
      accessibilityLabel="教科書の写真"
      testID="editor-canvas"
    >
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false}>
          {view && fit && (
            <Canvas style={{ width: view.width, height: view.height }}>
              <Group
                transform={[
                  { translateX: zp.tx + zp.k * fit.ox },
                  { translateY: zp.ty + zp.k * fit.oy },
                  { scale },
                ]}
              >
                {image && (
                  <Image image={image} x={0} y={0} width={img.width} height={img.height} fit="fill" />
                )}
                {state.preview ? (
                  <ReviewMaskLayer
                    paths={paths}
                    revealed={new Set(state.previewRevealed)}
                    scale={scale}
                    img={img}
                  />
                ) : (
                  <EditMaskLayer paths={paths} selectedId={state.selectedId} scale={scale} />
                )}
              </Group>
              {live?.kind === 'stroke' && (
                <Path
                  path={polylinePath(live.points)}
                  style="stroke"
                  strokeWidth={live.widthPt}
                  strokeCap="round"
                  strokeJoin="round"
                  color={c.mask}
                  opacity={0.8}
                />
              )}
              {live?.kind === 'rect' && (
                <Rect
                  x={Math.min(live.a.x, live.b.x)}
                  y={Math.min(live.a.y, live.b.y)}
                  width={Math.abs(live.b.x - live.a.x)}
                  height={Math.abs(live.b.y - live.a.y)}
                  color={c.mask}
                  opacity={0.8}
                />
              )}
              {finger && live?.kind === 'stroke' && (
                <Circle
                  cx={finger.x}
                  cy={finger.y}
                  r={live.widthPt / 2 + 4}
                  style="stroke"
                  strokeWidth={2}
                  color="#FFFFFF"
                />
              )}
            </Canvas>
          )}
        </View>
      </GestureDetector>
      {handle && !state.preview && (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="選択中のマスクを消す"
          onPress={onDeleteSelected}
          hitSlop={10}
          testID="delete-selected"
          style={[styles.handle, { left: handle.x - 13, top: handle.y - 13, backgroundColor: c.ink }]}
        >
          <Icon name="close" size={16} color={c.onInk} />
        </PressableScale>
      )}
      <View pointerEvents="none" style={styles.overlayRow}>
        <View style={[styles.pill, { backgroundColor: c.overlay }]}>
          <View style={[styles.dot, { backgroundColor: c.mask }]} />
          <AppText variant="caption" color="#FFFFFF" testID="mask-count">
            マスク {state.masks.length}
          </AppText>
        </View>
        {zp.k > 1.01 && (
          <View style={[styles.pill, { backgroundColor: c.overlay }]}>
            <AppText variant="caption" color="#FFFFFF">
              {zp.k.toFixed(1)}×
            </AppText>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, overflow: 'hidden' },
  overlayRow: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  handle: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
