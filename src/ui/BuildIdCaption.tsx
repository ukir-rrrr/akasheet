import { StyleSheet } from 'react-native';

import { formatBuildAccessibilityLabel, formatBuildCaption, readBuildMeta } from '@/shared/buildMeta';

import { AppText } from './primitives';
import { useTheme } from './theme';

export function BuildIdCaption() {
  const { c } = useTheme();
  const meta = readBuildMeta();
  const label = formatBuildCaption(meta);
  return (
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
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
