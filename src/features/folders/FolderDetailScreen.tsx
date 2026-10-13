import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { CardSummary } from '@/data/repos/cardRepo';
import { useAppData } from '@/features/app/AppDataProvider';
import { flash, useFlash } from '@/features/app/flash';
import { goBackOr } from '@/features/app/navigation';
import {
  useCards,
  useFolder,
  useFolders,
  useQueryInvalidation,
  useNextDue,
  useToday,
} from '@/features/app/queries';
import { MaskThumb } from '@/features/canvas/MaskThumb';
import { useDialogs } from '@/ui/dialogs';
import { CaptureDock } from '@/ui/Dock';
import { formatShortDate } from '@/ui/format';
import { haptic } from '@/ui/haptics';
import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  FolderTab,
  IconButton,
  PressableScale,
  Skeleton,
} from '@/ui/primitives';
import { heights, radius, useTheme } from '@/ui/theme';
import { Toast } from '@/ui/Toast';

import { useFolderActions } from './useFolderActions';

type Filter = 'all' | 'today' | 'again' | 'new';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'すべて' },
  { key: 'today', label: '今日' },
  { key: 'again', label: 'まだ' },
  { key: 'new', label: '新規' },
];

function matches(card: CardSummary, f: Filter, dayEnd: number): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'today':
      return card.dueAt < dayEnd;
    case 'again':
      return card.phase === 'learning' || card.phase === 'relearning';
    case 'new':
      return card.phase === 'new';
  }
}

export function FolderDetailScreen({ folderId }: { folderId: string }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const app = useAppData();
  const dialogs = useDialogs();
  const { afterCardsMove, afterCardsDelete } = useQueryInvalidation();
  const today = useToday();
  const folder = useFolder(folderId);
  const folders = useFolders();
  const cards = useCards(folderId);
  const nextDue = useNextDue(folderId);
  const actions = useFolderActions();
  const toast = useFlash();
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<string[] | null>(null);

  const all = cards.data ?? [];
  const due = all.filter((card) => card.dueAt < today.dayEnd).length;
  const shown = all.filter((card) => matches(card, filter, today.dayEnd));
  const columns = width >= 700 ? 3 : 2;
  const contentWidth = Math.min(width, 720) - 32;
  const thumbWidth = (contentWidth - 12 * (columns - 1)) / columns;

  const back = () => goBackOr('/');

  const openMenu = async () => {
    if (!folder.data) return;
    if ((await actions.folderMenu(folder.data, all.length)) === 'deleted') back();
  };

  const moveCards = async (ids: string[]) => {
    const others = (folders.data ?? []).filter((f) => f.id !== folderId);
    if (others.length === 0) {
      await dialogs.alert('移動先のフォルダがありません', '先にフォルダを追加してください。');
      return;
    }
    const target = await dialogs.sheet({
      title: `${ids.length}枚を移動`,
      actions: others.map((f) => ({ value: f.id, label: f.name })),
    });
    if (target === null) return;
    await dialogs.attempt('移動できませんでした', async () => {
      await app.cards.move(ids, target);
      setSelected(null);
      await afterCardsMove(folderId, target, ids);
    });
  };

  const deleteCards = async (ids: string[]) => {
    haptic.warning();
    const ok = await dialogs.confirm({
      title: `${ids.length}枚のカードを削除しますか?`,
      confirmLabel: '削除',
      destructive: true,
    });
    if (!ok) return;
    await dialogs.attempt('削除できませんでした', async () => {
      await app.cards.remove(ids);
      setSelected(null);
      await afterCardsDelete(folderId, ids);
    });
  };

  const cardMenu = async (card: CardSummary) => {
    haptic.medium();
    const choice = await dialogs.sheet({
      actions: [
        { value: 'select' as const, label: '複数選択', icon: 'checkmark-circle-outline' },
        { value: 'move' as const, label: '別のフォルダへ移動', icon: 'folder-open-outline' },
        {
          value: 'delete' as const,
          label: '削除',
          icon: 'trash-outline',
          destructive: true,
          hint: '元に戻せません',
        },
      ],
    });
    if (choice === 'select') setSelected([card.id]);
    if (choice === 'move') await moveCards([card.id]);
    if (choice === 'delete') await deleteCards([card.id]);
  };

  if (folder.isError || cards.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
        <ErrorState onRetry={() => (folder.refetch(), cards.refetch())} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <IconButton icon="chevron-back" label="戻る" onPress={back} testID="back" />
        {folder.data && <FolderTab name={folder.data.name} color={folder.data.color} size="sm" />}
        <AppText variant="section" numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
          {folder.data?.name ?? ''}
        </AppText>
        <IconButton icon="ellipsis-horizontal" label="フォルダのメニュー" onPress={openMenu} />
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}>
        {cards.isPending ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={80} />
            <Skeleton height={heights.cta} />
            <Skeleton height={200} />
          </View>
        ) : (
          <>
            <View style={styles.stats}>
              <Card style={styles.stat}>
                <AppText variant="sub" color={c.ink3}>
                  今日
                </AppText>
                <AppText variant="hero" color={due > 0 ? c.shuInk : c.ink} style={{ fontSize: 34 }}>
                  {due}
                </AppText>
              </Card>
              <Card style={styles.stat}>
                <AppText variant="sub" color={c.ink3}>
                  全
                </AppText>
                <AppText variant="hero" style={{ fontSize: 34 }}>
                  {all.length}
                </AppText>
              </Card>
            </View>
            <Button
              label={
                due > 0
                  ? `復習をはじめる(${due})`
                  : nextDue.data
                    ? `次は ${formatShortDate(nextDue.data, today.tz)}`
                    : '復習するカードはありません'
              }
              disabled={due === 0}
              height={heights.cta}
              onPress={() => router.push({ pathname: '/review/[folderId]', params: { folderId } })}
              testID="start-review"
            />

            {all.length === 0 ? (
              <View style={styles.emptyCards}>
                <AppText style={{ textAlign: 'center' }}>まだカードがありません</AppText>
                <AppText variant="sub" color={c.ink3} style={{ textAlign: 'center', marginTop: 6 }}>
                  下の「撮る」「選ぶ」から教科書のページを追加しましょう
                </AppText>
                <PressableScale
                  accessibilityRole="button"
                  onPress={() => actions.startCard('sample', folderId)}
                  style={{ padding: 10, marginTop: 6 }}
                  testID="folder-try-sample"
                >
                  <AppText variant="sub" color={c.ai}>
                    サンプルの教科書ページで試す
                  </AppText>
                </PressableScale>
              </View>
            ) : (
              <>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}
                >
                  {FILTERS.map((f) => {
                    const on = filter === f.key;
                    return (
                      <PressableScale
                        key={f.key}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        onPress={() => setFilter(f.key)}
                        style={[
                          styles.chip,
                          { backgroundColor: on ? c.ink : c.surface, borderColor: on ? c.ink : c.lineStrong },
                        ]}
                      >
                        <AppText variant="sub" color={on ? c.onInk : c.ink}>
                          {f.label}
                        </AppText>
                      </PressableScale>
                    );
                  })}
                </ScrollView>
                <View style={styles.grid}>
                  {shown.map((card) => {
                    const isSel = selected?.includes(card.id) ?? false;
                    return (
                      <PressableScale
                        key={card.id}
                        testID="card-thumb"
                        accessibilityRole="button"
                        accessibilityLabel={`カード ${card.title ?? formatShortDate(card.createdAt, today.tz)}、マスク${card.masks.length}個`}
                        accessibilityState={selected ? { selected: isSel } : undefined}
                        onPress={() =>
                          selected &&
                          setSelected(
                            isSel ? selected.filter((id) => id !== card.id) : [...selected, card.id],
                          )
                        }
                        onLongPress={() => (selected ? undefined : cardMenu(card))}
                        style={{ width: thumbWidth }}
                      >
                        <View>
                          <MaskThumb
                            rel={card.media.thumbPath}
                            img={{ width: card.media.width, height: card.media.height }}
                            masks={card.masks}
                            style={[
                              styles.thumb,
                              { width: thumbWidth, height: (thumbWidth * 4) / 3 },
                              isSel && { borderWidth: 3, borderColor: c.ink },
                            ]}
                          />
                          {card.dueAt < today.dayEnd && (
                            <View style={styles.thumbBadge}>
                              <Badge tone="due" label="今日" />
                            </View>
                          )}
                          {selected && (
                            <View
                              style={[
                                styles.check,
                                { backgroundColor: isSel ? c.ink : c.surface, borderColor: c.ink },
                              ]}
                            >
                              {isSel && (
                                <AppText variant="caption" color={c.onInk}>
                                  ✓
                                </AppText>
                              )}
                            </View>
                          )}
                        </View>
                        <AppText variant="sub" numberOfLines={1} style={{ marginTop: 6 }}>
                          {card.title ?? `${formatShortDate(card.createdAt, today.tz)} 追加`}
                        </AppText>
                        <AppText variant="caption" color={c.ink3}>
                          {card.dueAt < today.dayEnd
                            ? '今日'
                            : `次回 ${formatShortDate(card.dueAt, today.tz)}`}
                          ・マスク{card.masks.length}
                        </AppText>
                      </PressableScale>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>

      {selected ? (
        <View
          style={[
            styles.selectBar,
            { backgroundColor: c.surface, paddingBottom: insets.bottom + 10, borderTopColor: c.line },
          ]}
        >
          <Button label="やめる" kind="ghost" onPress={() => setSelected(null)} />
          <AppText variant="sub" style={{ flex: 1, textAlign: 'center' }}>
            {selected.length}枚を選択中
          </AppText>
          <Button
            label="移動"
            kind="secondary"
            icon="folder-open-outline"
            disabled={selected.length === 0}
            onPress={() => moveCards(selected)}
          />
          <Button
            label="削除"
            kind="secondary"
            icon="trash-outline"
            disabled={selected.length === 0}
            onPress={() => deleteCards(selected)}
          />
        </View>
      ) : (
        <CaptureDock
          onCamera={() => actions.startCard('camera', folderId)}
          onLibrary={() => actions.startCard('library', folderId)}
        />
      )}
      <Toast spec={toast} onDone={flash.clear} bottom={100 + insets.bottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  content: { paddingHorizontal: 16, gap: 12, width: '100%', maxWidth: 720, alignSelf: 'center' },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, padding: 16 },
  chips: { gap: 8, paddingVertical: 4 },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  thumb: { borderRadius: radius.sm },
  thumbBadge: { position: 'absolute', left: 6, top: 6 },
  check: {
    position: 'absolute',
    right: 6,
    top: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCards: { paddingVertical: 40, alignItems: 'center' },
  selectBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
