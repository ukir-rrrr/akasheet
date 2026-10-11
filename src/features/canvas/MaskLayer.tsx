import { DashPathEffect, Group, Path, type SkPath } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { Easing, useDerivedValue, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import type { Mask, MaskGeometry, Size } from '@/domain/mask/types';
import { geometryBBox } from '@/domain/mask/geometry';
import { useTheme } from '@/ui/theme';

import { hatchPath, maskPath } from './maskPaths';

export type LayerMask = { id: string; geometry: MaskGeometry };

/** Precomputed image-space paths per mask; recomputed only when geometry changes. */
export function useMaskPaths(masks: readonly LayerMask[], img: Size | null) {
  return useMemo(
    () =>
      img
        ? masks.map((m) => {
            const bbox = geometryBBox(m.geometry, img);
            return { id: m.id, path: maskPath(m.geometry, img), bbox };
          })
        : [],
    [masks, img],
  );
}

type Paths = ReturnType<typeof useMaskPaths>;

/** Editor style: translucent fill, dashed ink outline on the selected mask. `scale` = screen pt per image px. */
export function EditMaskLayer({
  paths,
  selectedId,
  scale,
}: {
  paths: Paths;
  selectedId: string | null;
  scale: number;
}) {
  const { c } = useTheme();
  return (
    <>
      {paths.map((p) => (
        <Path key={p.id} path={p.path} color={c.mask} opacity={0.55} />
      ))}
      {paths
        .filter((p) => p.id === selectedId)
        .map((p) => (
          <Path key={`sel-${p.id}`} path={p.path} style="stroke" strokeWidth={1.5 / scale} color="#1F1B16">
            <DashPathEffect intervals={[6 / scale, 4 / scale]} />
          </Path>
        ))}
    </>
  );
}

function ReviewMask({
  path,
  hatch,
  revealed,
  delay,
  scale,
  pressed,
}: {
  path: SkPath;
  hatch: SkPath;
  revealed: boolean;
  delay: number;
  scale: number;
  pressed: boolean;
}) {
  const { c } = useTheme();
  const progress = useSharedValue(revealed ? 1 : 0);
  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(revealed ? 1 : 0, { duration: 150, easing: Easing.out(Easing.cubic) }),
    );
  }, [revealed, delay, progress]);
  const fillOpacity = useDerivedValue(() => 1 - progress.value);
  const outlineOpacity = useDerivedValue(() => progress.value);
  return (
    <Group>
      <Group opacity={fillOpacity}>
        <Path path={path} color={pressed ? c.shuInk : c.mask} />
        <Group clip={path}>
          <Path path={hatch} style="stroke" strokeWidth={2 / scale} color={c.maskHatch} />
        </Group>
      </Group>
      <Group opacity={outlineOpacity}>
        <Path path={path} color={c.mask} opacity={0.09} />
        <Path path={path} style="stroke" strokeWidth={1.5 / scale} color={c.mask} />
      </Group>
    </Group>
  );
}

/**
 * Review style: unrevealed = opaque vermilion + 45° hatching; revealed = 1.5pt outline + 9% fill.
 * `staggerIds` (ord order) delays each reveal by 30ms for 「全部めくる」.
 */
export function ReviewMaskLayer({
  paths,
  revealed,
  scale,
  img,
  staggerIds,
  pressedId,
}: {
  paths: Paths;
  revealed: ReadonlySet<string>;
  scale: number;
  img: Size;
  staggerIds?: readonly string[];
  pressedId?: string | null;
}) {
  const hatches = useMemo(() => paths.map((p) => hatchPath(p.bbox, img, 7 / scale)), [paths, img, scale]);
  return (
    <>
      {paths.map((p, i) => {
        const idx = staggerIds?.indexOf(p.id) ?? -1;
        return (
          <ReviewMask
            key={p.id}
            path={p.path}
            hatch={hatches[i]}
            revealed={revealed.has(p.id)}
            delay={idx > 0 ? idx * 30 : 0}
            scale={scale}
            pressed={pressedId === p.id}
          />
        );
      })}
    </>
  );
}

export function toLayerMasks(masks: readonly Mask[]): LayerMask[] {
  return masks.map((m) => ({ id: m.id, geometry: m.geometry }));
}
