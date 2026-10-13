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
import { useDialogs } from '@/ui/dialogs';
import { CaptureDock } from '@/ui/Dock';
import { haptic } from '@/ui/haptics';
import { ErrorState, Skeleton } from '@/ui/primitives';
import { heights, useTheme } from '@/ui/theme';
import { Toast } from '@/ui/Toast';

import { FolderCardFilterBar } from './FolderCardFilterBar';
import { folderCardMatches, type FolderCardFilter } from './folderCardFilter';
import { FolderCardGrid } from './FolderCardGrid';
import { FolderCardsEmptyState } from './FolderCardsEmptyState';
import { FolderDetailHeader } from './FolderDetailHeader';
import { FolderReviewSection } from './FolderReviewSection';
import { FolderSelectionBar } from './FolderSelectionBar';
import { useFolderActions } from './useFolderActions';

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
  const [filter, setFilter] = useState<FolderCardFilter>('all');
  const [selected, setSelected] = useState<string[] | null>(null);

  const all = cards.data ?? [];
  const due = all.filter((card) => card.dueAt < today.dayEnd).length;
  const shown = all.filter((card) => folderCardMatches(card, filter, today.dayEnd));
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

  const toggleSelect = (cardId: string) => {
    if (!selected) return;
    setSelected(selected.includes(cardId) ? selected.filter((id) => id !== cardId) : [...selected, cardId]);
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
      <FolderDetailHeader folder={folder.data ?? undefined} onBack={back} onMenu={openMenu} />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 120 + insets.bottom }]}>
        {cards.isPending ? (
          <View style={{ gap: 12 }}>
            <Skeleton height={80} />
            <Skeleton height={heights.cta} />
            <Skeleton height={200} />
          </View>
        ) : (
          <>
            <FolderReviewSection
              folderId={folderId}
              dueCount={due}
              totalCount={all.length}
              nextDueAt={nextDue.data}
              tz={today.tz}
            />

            {all.length === 0 ? (
              <FolderCardsEmptyState onTrySample={() => actions.startCard('sample', folderId)} />
            ) : (
              <>
                <FolderCardFilterBar filter={filter} onFilter={setFilter} />
                <FolderCardGrid
                  cards={shown}
                  thumbWidth={thumbWidth}
                  dayEnd={today.dayEnd}
                  tz={today.tz}
                  selected={selected}
                  onToggleSelect={toggleSelect}
                  onCardMenu={cardMenu}
                />
              </>
            )}
          </>
        )}
      </ScrollView>

      {selected ? (
        <FolderSelectionBar
          selectedCount={selected.length}
          paddingBottom={insets.bottom + 10}
          borderTopColor={c.line}
          backgroundColor={c.surface}
          onCancel={() => setSelected(null)}
          onMove={() => moveCards(selected)}
          onDelete={() => deleteCards(selected)}
        />
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
  content: { paddingHorizontal: 16, gap: 12, width: '100%', maxWidth: 720, alignSelf: 'center' },
});
