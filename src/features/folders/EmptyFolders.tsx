import { StyleSheet, View } from 'react-native';

import { AppText, Button, PressableScale } from '@/ui/primitives';
import { heights, radius, useTheme } from '@/ui/theme';

const SUGGESTIONS = ['日本史', '英単語', '生物'];

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

export function EmptyFolders({
  onCreate,
  onStartWithPhoto,
  onSample,
}: {
  onCreate: (name?: string) => void;
  onStartWithPhoto: () => void;
  onSample: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.wrap}>
      <PaperIllustration />
      <AppText
        variant="headingMincho"
        style={{ textAlign: 'center', marginTop: 24 }}
        accessibilityRole="header"
      >
        最初のフォルダをつくりましょう
      </AppText>
      <AppText variant="sub" color={c.ink2} style={{ textAlign: 'center', marginTop: 10 }}>
        教科書やノートを撮って、隠したいところを{'\n'}指でなぞるだけ。赤シートのように復習できます。
      </AppText>
      <Button
        label="フォルダを作成"
        icon="add"
        onPress={() => onCreate()}
        height={heights.cta}
        style={styles.full}
        testID="create-first-folder"
      />
      <Button
        label="写真からはじめる"
        icon="camera-outline"
        kind="secondary"
        onPress={onStartWithPhoto}
        height={heights.button + 4}
        style={[styles.full, { marginTop: 12 }]}
      />
      <AppText variant="caption" color={c.ink3} style={{ marginTop: 24 }}>
        名前の候補から作る
      </AppText>
      <View style={styles.chips}>
        {SUGGESTIONS.map((s) => (
          <PressableScale
            key={s}
            accessibilityRole="button"
            accessibilityLabel={`${s}フォルダを作る`}
            onPress={() => onCreate(s)}
            style={[styles.chip, { borderColor: c.lineStrong, backgroundColor: c.surface }]}
            testID={`suggest-${s}`}
          >
            <AppText variant="sub">+ {s}</AppText>
          </PressableScale>
        ))}
      </View>
      <PressableScale
        accessibilityRole="button"
        onPress={onSample}
        style={{ marginTop: 20, padding: 8 }}
        testID="try-sample"
      >
        <AppText variant="sub" color={c.ai}>
          サンプルの教科書ページで試す
        </AppText>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 32, paddingHorizontal: 8 },
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
  full: { alignSelf: 'stretch', marginTop: 28 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' },
  chip: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    height: 36,
    justifyContent: 'center',
  },
});
