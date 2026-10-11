import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './primitives';
import { heights, radius, shadow, useTheme } from './theme';

/** Bottom dock shared by the folder list and folder detail: [撮る] primary, [選ぶ] secondary. */
export function CaptureDock({ onCamera, onLibrary }: { onCamera: () => void; onLibrary: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
      <View style={[styles.dock, shadow, { backgroundColor: c.surface }]}>
        <Button
          label="撮る"
          icon="camera-outline"
          onPress={onCamera}
          style={{ flex: 1 }}
          height={heights.cta - 4}
          testID="dock-camera"
        />
        <Button
          label="選ぶ"
          icon="images-outline"
          kind="secondary"
          onPress={onLibrary}
          style={{ flex: 1 }}
          height={heights.cta - 4}
          testID="dock-library"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, alignItems: 'center' },
  dock: { flexDirection: 'row', gap: 10, padding: 8, borderRadius: radius.xl, width: '100%', maxWidth: 560 },
});
