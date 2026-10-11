import { Canvas, Group, Image, Path, useImage } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { fitContain } from '@/domain/mask/transform';
import type { Mask, Size } from '@/domain/mask/types';
import { useMediaUri } from '@/features/app/queries';
import { useTheme } from '@/ui/theme';

import { maskPath } from './maskPaths';

/** Static thumbnail: photo (contain) with masks filled in. */
export function MaskThumb({
  rel,
  img,
  masks,
  style,
}: {
  rel: string;
  img: Size;
  masks: Mask[];
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const [view, setView] = useState<Size | null>(null);
  const uri = useMediaUri(rel);
  const image = useImage(uri.data ?? null);
  const paths = useMemo(() => masks.map((m) => maskPath(m.geometry, img)), [masks, img]);
  const fit = view ? fitContain(view, img) : null;
  const onLayout = (e: LayoutChangeEvent) =>
    setView({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height });

  return (
    <View style={[{ backgroundColor: c.canvas, overflow: 'hidden' }, style]} onLayout={onLayout}>
      {view && fit && (
        <Canvas style={{ width: view.width, height: view.height }}>
          <Group transform={[{ translateX: fit.ox }, { translateY: fit.oy }, { scale: fit.s0 }]}>
            {image && <Image image={image} x={0} y={0} width={img.width} height={img.height} fit="fill" />}
            {paths.map((p, i) => (
              <Path key={masks[i].id} path={p} color={c.mask} />
            ))}
          </Group>
        </Canvas>
      )}
    </View>
  );
}
