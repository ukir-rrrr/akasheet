import { Canvas, Image as SkImage, useImage } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppData } from '@/features/app/AppDataProvider';
import { goBackOr } from '@/features/app/navigation';
import { flash } from '@/features/app/flash';
import { useQueryInvalidation } from '@/features/app/queries';
import { useMaskPaths, EditMaskLayer } from '@/features/canvas/MaskLayer';
import type { ParsedImportBundle } from '@/import/types';
import { errorMessage } from '@/shared/errors';
import { useDialogs } from '@/ui/dialogs';
import { HeaderBar } from '@/ui/HeaderBar';
import { AppText, Button, IconButton, PressableScale } from '@/ui/primitives';
import { useTheme } from '@/ui/theme';

import { parseImportFromUri } from './parseImportUri';
import { pendingImport, pendingImportFile, type ImportFileRef } from './pendingImport';

type Step = 'confirm' | 'preview' | 'committing';

function PreviewCard({
  uri,
  width,
  height,
  masks,
}: {
  uri: string;
  width: number;
  height: number;
  masks: ParsedImportBundle['cards'][0]['masks'];
}) {
  const img = useImage(uri);
  const layerMasks = useMemo(() => masks.map((g, i) => ({ id: String(i), geometry: g })), [masks]);
  const paths = useMaskPaths(layerMasks, { width, height });
  if (!img) return <ActivityIndicator />;
  return (
    <Canvas style={{ width: '100%', aspectRatio: width / height, maxHeight: 280 }}>
      <SkImage image={img} x={0} y={0} width={width} height={height} fit="contain" />
      <EditMaskLayer paths={paths} selectedId={null} scale={1} />
    </Canvas>
  );
}

export function ImportScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const app = useAppData();
  const dialogs = useDialogs();
  const { afterCardSave } = useQueryInvalidation();
  const [fileRef] = useState<ImportFileRef | null>(() => pendingImportFile.take());
  const [bundle, setBundle] = useState<ParsedImportBundle | null>(() => pendingImport.peek());
  const [step, setStep] = useState<Step>(() => (pendingImport.peek() ? 'preview' : 'confirm'));
  const [loading, setLoading] = useState(() => !pendingImport.peek() && !!fileRef);
  const [error, setError] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewSize, setPreviewSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (bundle || !fileRef) return;
    let alive = true;
    parseImportFromUri(fileRef.uri, fileRef.fileName, fileRef.mimeType)
      .then((parsed) => {
        if (!alive) return;
        pendingImport.set(parsed);
        setBundle(parsed);
        setStep('confirm');
      })
      .catch((e) => alive && setError(errorMessage(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [bundle, fileRef]);

  const card = bundle?.cards[previewIndex];

  useEffect(() => {
    if (!card) return;
    let alive = true;
    (async () => {
      const { File, Paths } = await import('expo-file-system');
      const f = new File(Paths.cache, `import-preview-${previewIndex}.jpg`);
      f.create({ overwrite: true });
      f.write(card.imageBytes);
      if (!alive) return;
      setPreviewUri(f.uri);
      const prepared = await app.images.prepareImage(f.uri);
      if (!alive) return;
      setPreviewSize({ width: prepared.width, height: prepared.height });
    })().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [card, previewIndex, app.images]);

  const close = useCallback(async () => {
    const dirty = step !== 'confirm' || bundle;
    if (dirty) {
      const ok = await dialogs.confirm({
        title: 'インポートを中止しますか？',
        message: '取り込んだ内容は保存されません。',
        confirmLabel: '中止する',
        destructive: true,
      });
      if (!ok) return;
    }
    pendingImport.take();
    goBackOr('/');
  }, [bundle, dialogs, step]);

  const confirmStart = () => {
    if (!bundle) return;
    setStep('preview');
  };

  const commit = async () => {
    if (!bundle) return;
    setStep('committing');
    try {
      const result = await app.commitImport(bundle);
      pendingImport.take();
      for (const id of result.folderIds) afterCardSave(id);
      flash.show({
        message: `カードを ${result.created} 件取り込みました（${result.skipped} 件スキップ）`,
      });
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
      setStep('preview');
    }
  };

  const title =
    step === 'confirm'
      ? 'インポート'
      : step === 'preview'
        ? `プレビュー (${previewIndex + 1}/${bundle?.cards.length ?? 0})`
        : '取り込み中…';

  return (
    <View style={[styles.root, { backgroundColor: c.bg, paddingBottom: insets.bottom }]}>
      <HeaderBar style={{ backgroundColor: c.bg }}>
        <IconButton icon="close" label="閉じる" onPress={close} />
        <AppText variant="section" style={{ flex: 1, marginLeft: 8 }} numberOfLines={1}>
          {title}
        </AppText>
      </HeaderBar>
      <ScrollView contentContainerStyle={styles.body}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : error ? (
          <AppText color={c.warn}>{error}</AppText>
        ) : step === 'confirm' && bundle ? (
          <>
            <AppText variant="section">{bundle.label}</AppText>
            <AppText variant="sub" color={c.ink3} style={{ marginTop: 8 }}>
              {bundle.source === 'import:anki' ? 'Anki デッキ' : 'CSV'}から {bundle.cards.length}{' '}
              枚のカードを取り込みます。
            </AppText>
            <Button
              label="内容を確認"
              onPress={confirmStart}
              style={{ marginTop: 24 }}
              testID="import-confirm"
            />
          </>
        ) : step === 'preview' && bundle && card ? (
          <>
            <AppText variant="sub" color={c.ink2}>
              {card.folderPath}
              {card.title ? ` — ${card.title}` : ''}
            </AppText>
            {previewUri && previewSize ? (
              <View style={[styles.preview, { borderColor: c.line }]}>
                <PreviewCard
                  uri={previewUri}
                  width={previewSize.width}
                  height={previewSize.height}
                  masks={card.masks}
                />
              </View>
            ) : (
              <ActivityIndicator style={{ marginVertical: 24 }} />
            )}
            <View style={styles.row}>
              <PressableScale
                onPress={() => setPreviewIndex((i) => Math.max(0, i - 1))}
                disabled={previewIndex === 0}
                style={styles.navHit}
                accessibilityLabel="前のカード"
              >
                <AppText color={previewIndex === 0 ? c.ink3 : c.ink}>前へ</AppText>
              </PressableScale>
              <PressableScale
                onPress={() => setPreviewIndex((i) => Math.min(bundle.cards.length - 1, i + 1))}
                disabled={previewIndex >= bundle.cards.length - 1}
                style={styles.navHit}
                accessibilityLabel="次のカード"
              >
                <AppText color={previewIndex >= bundle.cards.length - 1 ? c.ink3 : c.ink}>次へ</AppText>
              </PressableScale>
            </View>
            <Button
              label={`${bundle.cards.length} 枚を取り込む`}
              onPress={commit}
              style={{ marginTop: 16 }}
              testID="import-commit"
            />
          </>
        ) : step === 'committing' ? (
          <ActivityIndicator style={{ marginTop: 40 }} />
        ) : (
          <AppText>
            共有されたファイルがありません。他のアプリから .apkg / .csv / .zip を「めくる」に送ってください。
          </AppText>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: 20 },
  preview: { marginTop: 16, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  navHit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
