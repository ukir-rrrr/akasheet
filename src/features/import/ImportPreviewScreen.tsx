import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppData } from '@/features/app/AppDataProvider';
import { goBackOr } from '@/features/app/navigation';
import { useQueryInvalidation } from '@/features/app/queries';
import { summarizePreview } from '@/import/previewStats';
import type { ImportPreview } from '@/import/types';
import { errorMessage } from '@/shared/errors';
import { HeaderBar } from '@/ui/HeaderBar';
import { AppText, Button, Card, IconButton } from '@/ui/primitives';
import { heights, space, useTheme } from '@/ui/theme';

import { pendingImportPreview } from './importHandoff';

function folderLabel(path: string[]): string {
  return path.join(' / ');
}

type Props = { preview: ImportPreview };

export function ImportPreviewScreen({ preview }: Props) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const app = useAppData();
  const { afterImport } = useQueryInvalidation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    return summarizePreview(preview, new Set());
  }, [preview]);

  const [dupSet, setDupSet] = useState<Set<string> | null>(null);
  const resolvedStats = useMemo(() => {
    if (!dupSet) return stats;
    return summarizePreview(preview, dupSet);
  }, [preview, dupSet, stats]);

  useEffect(() => {
    void app.cards
      .existingExternalIds(
        preview.source,
        preview.cards.map((c) => c.externalId),
      )
      .then(setDupSet);
  }, [app.cards, preview]);

  const onConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await app.applyImport(preview);
      await afterImport();
      pendingImportPreview.take();
      goBackOr('/');
      return result;
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <HeaderBar style={styles.header}>
        <IconButton icon="chevron-back" label="戻る" onPress={() => router.back()} />
        <AppText variant="section" style={{ flex: 1 }} accessibilityRole="header">
          取り込みプレビュー
        </AppText>
      </HeaderBar>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <AppText variant="sub" color={c.ink3}>
          {preview.fileName}
        </AppText>
        <Card style={{ marginTop: space[12], gap: 8 }}>
          <AppText>
            {resolvedStats.cardCount} 枚・{resolvedStats.folderCount} フォルダ
          </AppText>
          {resolvedStats.duplicateCount > 0 && (
            <AppText variant="sub" color={c.warn}>
              重複 {resolvedStats.duplicateCount} 枚はスキップします
            </AppText>
          )}
        </Card>

        <AppText variant="section" style={{ marginTop: space[16], marginBottom: space[8] }}>
          フォルダと枚数
        </AppText>
        <Card style={{ overflow: 'hidden' }}>
          {preview.folders.map((f, i) => (
            <View
              key={folderLabel(f.path)}
              style={[
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
              ]}
            >
              <AppText style={{ flex: 1 }} numberOfLines={2}>
                {folderLabel(f.path)}
              </AppText>
              <AppText variant="sub" color={c.ink3}>
                {f.cardCount}枚
              </AppText>
            </View>
          ))}
        </Card>

        {error && (
          <AppText variant="sub" color={c.warn} style={{ marginTop: space[12] }}>
            {error}
          </AppText>
        )}

        <Button
          label={busy ? '取り込み中…' : '取り込む'}
          onPress={() => void onConfirm()}
          disabled={busy || resolvedStats.cardCount === 0}
          style={{ marginTop: space[24], minHeight: heights.tap }}
          testID="import-confirm"
        />
        <Button
          kind="secondary"
          label="キャンセル"
          onPress={() => router.back()}
          style={{ marginTop: space[12], minHeight: heights.tap }}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, paddingBottom: 8, paddingHorizontal: 8 },
  content: { paddingHorizontal: 16, maxWidth: 720, width: '100%', alignSelf: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: heights.tap,
  },
});
