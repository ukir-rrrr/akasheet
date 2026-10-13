import { StyleSheet, View } from 'react-native';

import { AppText, PressableScale } from '@/ui/primitives';
import { useTheme } from '@/ui/theme';

type Props = {
  onTrySample: () => void;
};

export function FolderCardsEmptyState({ onTrySample }: Props) {
  const { c } = useTheme();

  return (
    <View style={styles.emptyCards}>
      <AppText style={{ textAlign: 'center' }}>まだカードがありません</AppText>
      <AppText variant="sub" color={c.ink3} style={{ textAlign: 'center', marginTop: 6 }}>
        下の「撮る」「選ぶ」から教科書のページを追加しましょう
      </AppText>
      <PressableScale
        accessibilityRole="button"
        onPress={onTrySample}
        style={{ padding: 10, marginTop: 6 }}
        testID="folder-try-sample"
      >
        <AppText variant="sub" color={c.ai}>
          サンプルの教科書ページで試す
        </AppText>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyCards: { paddingVertical: 40, alignItems: 'center' },
});
