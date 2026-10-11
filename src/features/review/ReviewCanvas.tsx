import { Canvas, Group, Image, useImage } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { hitTest } from '@/domain/mask/hitTest';
import { imageToScreen, screenToImage } from '@/domain/mask/transform';
import type { Mask, Size } from '@/domain/mask/types';
import { useMediaUri } from '@/features/app/queries';
import { ReviewMaskLayer, toLayerMasks, useMaskPaths } from '@/features/canvas/MaskLayer';
import { useZoomPan } from '@/features/canvas/useZoomPan';
import { AppText, PressableScale } from '@/ui/primitives';
import { useTheme } from '@/ui/theme';

const TAP_TOLERANCE_PT = 8;
const MIN_TARGET_PT = 44;

export function ReviewCanvas({
  rel,
  img,
  masks,
  revealed,
  staggerIds,
  onToggle,
}: {
  rel: string;
  img: Size;
  masks: Mask[];
  revealed: ReadonlySet<string>;
  staggerIds?: readonly string[];
  onToggle: (maskId: string) => void;
}) {
  const { c } = useTheme();
  const uri = useMediaUri(rel);
  const image = useImage(uri.data ?? null);
  const { view, fit, zp, onLayout, pinch, doubleTap } = useZoomPan(img);
  const layerMasks = useMemo(() => toLayerMasks(masks), [masks]);
  const paths = useMaskPaths(layerMasks, img);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const scale = fit ? fit.s0 * zp.k : 1;

  const findMask = (x: number, y: number) => {
    if (!fit) return null;
    const pt = screenToImage({ x, y }, fit, zp);
    return hitTest(masks, pt, img, {
      tolPx: TAP_TOLERANCE_PT / scale,
      minTargetPx: MIN_TARGET_PT / scale,
      revealed,
    });
  };

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onBegin((e) => setPressedId(findMask(e.x, e.y)))
    .onEnd((e) => {
      const id = findMask(e.x, e.y);
      if (id) onToggle(id);
    })
    .onFinalize(() => setPressedId(null));

  const gesture = Gesture.Simultaneous(pinch, Gesture.Exclusive(doubleTap, tap));

  return (
    <View style={[styles.stage, { backgroundColor: c.canvas }]} onLayout={onLayout}>
      <GestureDetector gesture={gesture}>
        <View
          style={StyleSheet.absoluteFill}
          collapsable={false}
          accessibilityLabel="教科書の写真"
          testID="review-canvas"
        >
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
                <ReviewMaskLayer
                  paths={paths}
                  revealed={revealed}
                  scale={scale}
                  img={img}
                  staggerIds={staggerIds}
                  pressedId={pressedId}
                />
              </Group>
            </Canvas>
          )}
        </View>
      </GestureDetector>
      {fit &&
        masks
          .filter((m) => !revealed.has(m.id))
          .map((m) => {
            const p = imageToScreen(
              { x: m.bbox.x * img.width, y: (m.bbox.y + m.bbox.h / 2) * img.height },
              fit,
              zp,
            );
            return (
              <PressableScale
                key={m.id}
                testID={`mask-number-${m.ord + 1}`}
                accessibilityRole="button"
                accessibilityLabel={`答え ${m.ord + 1}、隠れています`}
                accessibilityHint="ダブルタップでめくる"
                onPress={() => onToggle(m.id)}
                hitSlop={8}
                style={[styles.number, { left: p.x - 2, top: p.y - 9, backgroundColor: c.shuInk }]}
              >
                <AppText variant="caption" color="#FFFFFF" style={{ fontSize: 11, lineHeight: 14 }}>
                  {m.ord + 1}
                </AppText>
              </PressableScale>
            );
          })}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, overflow: 'hidden' },
  number: {
    position: 'absolute',
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
