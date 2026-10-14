import { StyleSheet, View } from 'react-native';

import { formatBuildAccessibilityLabel, formatBuildCaption, readBuildMeta } from '@/shared/buildMeta';

import { AppText } from './primitives';
import { useTheme } from './theme';

export function BuildIdCaption() {
  const { c } = useTheme();
  const meta = readBuildMeta();
  const label = formatBuildCaption(meta);
  return (
    <View style={styles.wrap} pointerEvents="none" importantForAccessibility="no-hide-descendants">
      <AppText
        variant="sub"
        color={c.ink3}
        testID="build-id"
        accessibilityLabel={formatBuildAccessibilityLabel(meta)}
        accessibilityRole="text"
        style={styles.text}
      >
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 16 },
  text: { fontSize: 11, fontWeight: '500', letterSpacing: 0.2 },
});
