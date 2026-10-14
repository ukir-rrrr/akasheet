import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './primitives';
import { heights, radius, shadow, useTheme } from './theme';

const DOCK_INNER_PADDING = 8;
const DOCK_BUTTON_HEIGHT = heights.cta - 4;

/** Matches `CaptureDock` wrap `paddingBottom: Math.max(insets.bottom, …)`. */
export const CAPTURE_DOCK_MIN_BOTTOM_PADDING = 12;

/** Floating dock card height (inner padding + CTA row), excluding safe-area inset. */
export const CAPTURE_DOCK_CHROME_HEIGHT = DOCK_INNER_PADDING * 2 + DOCK_BUTTON_HEIGHT;

/** Distance from the screen bottom to the top of the dock chrome. */
export function captureDockStackHeight(safeAreaBottom: number): number {
  return Math.max(safeAreaBottom, CAPTURE_DOCK_MIN_BOTTOM_PADDING) + CAPTURE_DOCK_CHROME_HEIGHT;
}

export const BUILD_ID_GAP_ABOVE_DOCK = 6;
export const BUILD_ID_CAPTION_BAND = 20;
export const TOAST_GAP_ABOVE_BUILD_ID = 8;

export function buildIdCaptionBottom(safeAreaBottom: number): number {
  return captureDockStackHeight(safeAreaBottom) + BUILD_ID_GAP_ABOVE_DOCK;
}

export function folderListToastBottom(safeAreaBottom: number, withDock: boolean): number {
  if (!withDock) return 24 + safeAreaBottom;
  return buildIdCaptionBottom(safeAreaBottom) + BUILD_ID_CAPTION_BAND + TOAST_GAP_ABOVE_BUILD_ID;
}

export function folderListScrollPaddingBottom(safeAreaBottom: number, withDock: boolean): number {
  if (!withDock) return 40 + safeAreaBottom;
  return folderListToastBottom(safeAreaBottom, true) + 16;
}

/** Bottom dock shared by the folder list and folder detail: [撮る] primary, [選ぶ] secondary. */
export function CaptureDock({ onCamera, onLibrary }: { onCamera: () => void; onLibrary: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, CAPTURE_DOCK_MIN_BOTTOM_PADDING) }]}
      pointerEvents="box-none"
    >
      <View style={[styles.dock, shadow, { backgroundColor: c.surface }]}>
        <Button
          label="撮る"
          icon="camera-outline"
          onPress={onCamera}
          style={{ flex: 1 }}
          height={DOCK_BUTTON_HEIGHT}
          testID="dock-camera"
        />
        <Button
          label="選ぶ"
          icon="images-outline"
          kind="secondary"
          onPress={onLibrary}
          style={{ flex: 1 }}
          height={DOCK_BUTTON_HEIGHT}
          testID="dock-library"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, alignItems: 'center' },
  dock: {
    flexDirection: 'row',
    gap: 10,
    padding: DOCK_INNER_PADDING,
    borderRadius: radius.xl,
    width: '100%',
    maxWidth: 560,
  },
});
