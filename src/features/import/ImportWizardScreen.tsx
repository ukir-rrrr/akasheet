import * as DocumentPicker from 'expo-document-picker';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { useAppData } from '@/features/app/AppDataProvider';
import { flash, useFlash } from '@/features/app/flash';
import { keys } from '@/features/app/queryKeys';
import { useFolders } from '@/features/app/queries';
import { planImport } from '@/import/planImport';
import type {
  CollisionPolicy,
  DeckFolderTarget,
  ImportFormat,
  ImportPlan,
  ParsedImportBundle,
} from '@/import/types';
import { AppText, Button, Card, PressableScale } from '@/ui/primitives';
import { heights, radius, space, useTheme } from '@/ui/theme';
import { Toast } from '@/ui/Toast';

import { imageUriForParsedCard, parseImportPayload } from './parseImportFile';
import { resolveDeckFolderIds } from './resolveDeckFolders';

type Step = 1 | 2 | 3 | 4 | 5;

const COLLISION_LABELS: Record<CollisionPolicy, string> = {
  skip: 'スキップ（既存を残す）',
  overwrite: '上書き（同じ外部IDを置き換え）',
  duplicate: '複製（別IDとして追加）',
};

function initialDeckMapping(
  bundle: ParsedImportBundle,
  folderId: string | null,
): Record<string, DeckFolderTarget> {
  const out: Record<string, DeckFolderTarget> = {};
  for (const d of bundle.decks) {
    const key = d.path.join('::');
    if (folderId) out[key] = { mode: 'merge', folderId };
    else
      out[key] = {
        mode: 'new',
        parentFolderId: null,
        name: d.path[d.path.length - 1] ?? '取り込み',
      };
  }
  return out;
}

export function ImportWizardScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const app = useAppData();
  const folders = useFolders();
  const qc = useQueryClient();
  const toast = useFlash();

  const [step, setStep] = useState<Step>(1);
  const [format, setFormat] = useState<ImportFormat | null>(null);
  const [mainUri, setMainUri] = useState<string | null>(null);
  const [mainName, setMainName] = useState('');
  const [zipUri, setZipUri] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ParsedImportBundle | null>(null);
  const [mapping, setMapping] = useState<Record<string, DeckFolderTarget>>({});
  const [policy, setPolicy] = useState<CollisionPolicy>('skip');
  const [busy, setBusy] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importPlan, setImportPlan] = useState<ImportPlan | null>(null);

  const deckKeys = useMemo(() => bundle?.decks.map((d) => d.path.join('::')) ?? [], [bundle]);

  useEffect(() => {
    if (step !== 5 || !bundle) return;
    let alive = true;
    void (async () => {
      const folderIds = await resolveDeckFolderIds(app.folders, bundle, mapping);
      const existing = await app.cards.listExternalIds(bundle.source);
      const plan = planImport(
        bundle,
        folderIds,
        policy,
        existing.map((r) => ({ externalId: r.external_id, cardId: r.id })),
      );
      if (alive) setImportPlan(plan);
    })();
    return () => {
      alive = false;
    };
  }, [step, bundle, mapping, policy, app.cards, app.folders]);

  const counts = importPlan?.counts ?? { create: 0, skip: 0, overwrite: 0, duplicate: 0 };

  async function pickMain() {
    if (!format) return;
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    setMainUri(res.assets[0].uri);
    setMainName(res.assets[0].name);
    setBundle(null);
    setParseError(null);
  }

  async function pickZip() {
    const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (res.canceled || !res.assets[0]) return;
    setZipUri(res.assets[0].uri);
  }

  async function parseFiles() {
    if (!format || !mainUri) return;
    setBusy(true);
    setParseError(null);
    try {
      const parsed = await parseImportPayload(format, mainUri, mainName, app.clock.now(), zipUri);
      setBundle(parsed);
      const list = folders.data ?? [];
      setMapping(initialDeckMapping(parsed, list[0]?.id ?? null));
      setStep(3);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'ファイルを読み取れませんでした');
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!bundle || !importPlan) return;
    setBusy(true);
    try {
      const result = await app.runImport(importPlan, bundle.source, async (card) =>
        imageUriForParsedCard(card, app.clock.now(), async () => null),
      );
      await qc.invalidateQueries({ queryKey: keys.folders });
      flash.show({ message: `取り込み完了: ${result.imported}枚（スキップ ${result.skipped}）` });
      router.back();
    } catch (e) {
      flash.show({ message: e instanceof Error ? e.message : '取り込みに失敗しました' });
    } finally {
      setBusy(false);
    }
  }

  const stepTitle =
    step === 1
      ? '形式を選ぶ'
      : step === 2
        ? 'ファイルを選ぶ'
        : step === 3
          ? 'フォルダの割り当て'
          : step === 4
            ? '重複の扱い'
            : '内容の確認';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 16,
          gap: space[16],
          maxWidth: 720,
          alignSelf: 'center',
          width: '100%',
        }}
      >
        <View style={styles.topRow}>
          <AppText variant="title">{stepTitle}</AppText>
          <AppText variant="sub" color={c.ink3}>
            {step}/5
          </AppText>
        </View>
        <AppText variant="sub" color={c.ink3}>
          他アプリの単語帳を akasheet に取り込みます。いつでもキャンセルできます。
        </AppText>

        {step === 1 && (
          <Card style={{ gap: 12, padding: 16 }}>
            <ChoiceRow
              label="Anki（.apkg）"
              hint="デッキごとにフォルダへ振り分け"
              selected={format === 'anki'}
              onPress={() => setFormat('anki')}
            />
            <ChoiceRow
              label="CSV + 画像 zip"
              hint="表と画像をまとめて指定"
              selected={format === 'csv'}
              onPress={() => setFormat('csv')}
            />
            <Button label="次へ" disabled={!format} onPress={() => setStep(2)} testID="import-next" />
          </Card>
        )}

        {step === 2 && format && (
          <Card style={{ gap: 12, padding: 16 }}>
            <AppText variant="sub" color={c.ink2}>
              {format === 'anki' ? '.apkg ファイルを選びます' : 'CSV を選び、必要なら画像 zip も選びます'}
            </AppText>
            <Button
              kind="secondary"
              label={mainName || 'ファイルを選ぶ'}
              onPress={pickMain}
              testID="import-pick"
            />
            {format === 'csv' && (
              <Button
                kind="secondary"
                label={zipUri ? '画像 zip を選び直す' : '画像 zip（任意）'}
                onPress={pickZip}
              />
            )}
            {parseError && (
              <AppText variant="sub" color={c.shuInk}>
                {parseError}
              </AppText>
            )}
            <View style={styles.row}>
              <Button kind="ghost" label="戻る" onPress={() => setStep(1)} />
              <Button label="読み込む" loading={busy} disabled={!mainUri} onPress={parseFiles} />
            </View>
          </Card>
        )}

        {step === 3 && bundle && (
          <Card style={{ gap: 12, padding: 16 }}>
            <AppText variant="sub" color={c.ink2}>
              デッキ名（親::子）はフォルダの入れ子になります。既存フォルダにまとめるか、新規作成を選べます。
            </AppText>
            {deckKeys.map((key) => (
              <DeckMapRow
                key={key}
                deckKey={key}
                folders={folders.data ?? []}
                value={mapping[key]}
                onChange={(v) => setMapping((m) => ({ ...m, [key]: v }))}
              />
            ))}
            <View style={styles.row}>
              <Button kind="ghost" label="戻る" onPress={() => setStep(2)} />
              <Button
                label="次へ"
                onPress={() => {
                  setImportPlan(null);
                  setStep(4);
                }}
              />
            </View>
          </Card>
        )}

        {step === 4 && (
          <Card style={{ gap: 10, padding: 16 }}>
            <AppText variant="sub" color={c.ink2}>
              同じ外部IDのカードが既にあるときの動作です。
            </AppText>
            {(Object.keys(COLLISION_LABELS) as CollisionPolicy[]).map((p) => (
              <ChoiceRow
                key={p}
                label={COLLISION_LABELS[p]}
                selected={policy === p}
                onPress={() => setPolicy(p)}
              />
            ))}
            <View style={styles.row}>
              <Button kind="ghost" label="戻る" onPress={() => setStep(3)} />
              <Button
                label="次へ"
                onPress={() => {
                  setImportPlan(null);
                  setStep(5);
                }}
              />
            </View>
          </Card>
        )}

        {step === 5 && bundle && (
          <Card style={{ gap: 12, padding: 16 }}>
            <AppText>
              新規 {counts.create}・上書き {counts.overwrite}・複製 {counts.duplicate}・スキップ {counts.skip}
            </AppText>
            <AppText variant="sub" color={c.ink3}>
              合計 {bundle.cards.length} 枚を解析しました。
            </AppText>
            {bundle.warnings.length > 0 && (
              <AppText variant="sub" color={c.warn}>
                {bundle.warnings.slice(0, 3).join(' / ')}
              </AppText>
            )}
            <View style={styles.row}>
              <Button kind="ghost" label="戻る" onPress={() => setStep(4)} />
              <Button label="取り込む" loading={busy} disabled={!importPlan} onPress={confirmImport} />
            </View>
          </Card>
        )}

        <Button kind="ghost" label="キャンセル" onPress={() => router.back()} height={heights.tap} />
      </ScrollView>
      <Toast spec={toast} onDone={flash.clear} bottom={24 + insets.bottom} />
    </View>
  );
}

function ChoiceRow({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      style={[
        styles.choice,
        { borderColor: selected ? c.ink : c.lineStrong, backgroundColor: selected ? c.surface2 : c.surface },
      ]}
    >
      <AppText>{label}</AppText>
      {hint ? (
        <AppText variant="sub" color={c.ink3}>
          {hint}
        </AppText>
      ) : null}
    </PressableScale>
  );
}

function DeckMapRow({
  deckKey,
  folders,
  value,
  onChange,
}: {
  deckKey: string;
  folders: { id: string; name: string }[];
  value?: DeckFolderTarget;
  onChange: (v: DeckFolderTarget) => void;
}) {
  const { c } = useTheme();
  const mode = value?.mode ?? 'merge';
  const folderId = value?.mode === 'merge' ? value.folderId : (folders[0]?.id ?? '');
  return (
    <View
      style={{ gap: 8, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}
    >
      <AppText variant="button">{deckKey}</AppText>
      <View style={styles.row}>
        <PressableScale onPress={() => onChange({ mode: 'merge', folderId })}>
          <AppText variant="sub" color={mode === 'merge' ? c.ink : c.ink3}>
            既存へ
          </AppText>
        </PressableScale>
        <PressableScale
          onPress={() =>
            onChange({
              mode: 'new',
              parentFolderId: null,
              name: deckKey.split('::').pop() ?? deckKey,
            })
          }
        >
          <AppText variant="sub" color={mode === 'new' ? c.ink : c.ink3}>
            新規
          </AppText>
        </PressableScale>
      </View>
      {mode === 'merge' && folders.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {folders.map((f) => (
            <PressableScale
              key={f.id}
              onPress={() => onChange({ mode: 'merge', folderId: f.id })}
              style={[
                styles.folderChip,
                {
                  borderColor: folderId === f.id ? c.ink : c.line,
                  backgroundColor: folderId === f.id ? c.surface2 : c.surface,
                },
              ]}
            >
              <AppText variant="sub">{f.name}</AppText>
            </PressableScale>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  row: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end', flexWrap: 'wrap' },
  choice: { padding: 14, borderRadius: radius.md, borderWidth: 1.5, gap: 4 },
  folderChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1 },
});
