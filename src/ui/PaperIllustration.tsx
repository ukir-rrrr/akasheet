import { StyleSheet, View } from 'react-native';

import { useTheme } from './theme';

/** A stack of paper with a red sheet on top, drawn with plain views. */
export function PaperIllustration() {
  const { c } = useTheme();
  return (
    <View style={styles.illus} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View
        style={[
          styles.paper,
          { backgroundColor: c.surface2, transform: [{ rotate: '-8deg' }], left: 14, top: 18 },
        ]}
      />
      <View
        style={[
          styles.paper,
          {
            backgroundColor: c.surface,
            borderColor: c.line,
            borderWidth: 1,
            transform: [{ rotate: '-2deg' }],
          },
        ]}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <View
            key={i}
            style={[styles.line, { backgroundColor: c.lineStrong, width: i === 4 ? '50%' : '78%' }]}
          />
        ))}
      </View>
      <View style={[styles.sheet, { backgroundColor: c.mask }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  illus: { width: 170, height: 130 },
  paper: {
    position: 'absolute',
    width: 130,
    height: 100,
    borderRadius: 8,
    padding: 14,
    gap: 9,
    left: 10,
    top: 6,
  },
  line: { height: 5, borderRadius: 3 },
  sheet: {
    position: 'absolute',
    width: 72,
    height: 64,
    borderRadius: 6,
    right: 4,
    bottom: 0,
    opacity: 0.85,
    transform: [{ rotate: '10deg' }],
  },
});
