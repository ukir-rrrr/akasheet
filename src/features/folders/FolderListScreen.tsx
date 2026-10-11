import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FolderSummary } from '@/data/repos/folderRepo';
import { flash, useFlash } from '@/features/app/flash';
import { useFolders, useNextDue, useToday } from '@/features/app/queries';
import { CaptureDock } from '@/ui/Dock';
import { formatCount, formatHeaderDate, formatRelativeDay, formatShortDate } from '@/ui/format';
import {
  AppText,
  Badge,
  Button,
  Card,
  ErrorState,
  FolderTab,
  Icon,
  PressableScale,
  Skeleton,
} from '@/ui/primitives';
import { heights, radius, space, useTheme } from '@/ui/theme';
import { Toast } from '@/ui/Toast';

import { EmptyFolders } from './EmptyFolders';
import { useFolderActions } from './useFolderActions';

const SECONDS_PER_CARD = 20;

export function FolderListScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const today = useToday();
  const folders = useFolders();
  const nextDue = useNextDue(null);
  const actions = useFolderActions();
  const toast = useFlash();

  const list = folders.data ?? [];
  const totalDue = list.reduce((n, f) => n + f.dueCount, 0);
  const dueFolders = list.filter((f) => f.dueCount > 0).length;
  const hasFolders = list.length > 0;

  let body;
  if (folders.isPending) {
    body = (
      <View style={{ gap: 12 }} accessibilityLabel="読み込み中">
        <Skeleton height={140} style={{ borderRadius: radius.lg }} />
        <Skeleton height={heights.row} />
        <Skeleton height={heights.row} />
        <Skeleton height={heights.row} />
      </View>
    );
  } else if (folders.isError) {
    body = <ErrorState onRetry={() => folders.refetch()} />;
  } else if (!hasFolders) {
    body = (
      <EmptyFolders
        onCreate={actions.createFolder}
        onStartWithPhoto={() => actions.chooseSourceAndStart()}
        onSample={() => actions.startCard('sample')}
      />
    );
  } else {
    body = (
      <>
        <Card style={styles.hero}>
          <View style={[styles.sheetPiece, { backgroundColor: c.mask }]} />
          <AppText variant="sub" color={c.ink2}>
            今日の復習
          </AppText>
          {totalDue > 0 ? (
            <View style={styles.heroRow}>
              <View style={{ flex: 1 }}>
                <AppText accessibilityLabel={`今日の復習 ${totalDue}枚`}>
                  <AppText variant="hero">{totalDue}</AppText>
                  <AppText variant="body"> 枚</AppText>
                </AppText>
                <AppText variant="sub" color={c.ink3}>
                  {dueFolders}フォルダ・約{Math.max(1, Math.ceil((totalDue * SECONDS_PER_CARD) / 60))}分
                </AppText>
              </View>
              <Button label="まとめて復習 ›" onPress={() => router.push('/review/all')} testID="review-all" />
            </View>
          ) : (
            <View style={{ marginTop: 8 }}>
              <AppText>
                今日の分は終わりました <AppText color={c.matcha}>✓</AppText>
              </AppText>
              {nextDue.data != null && (
                <AppText variant="sub" color={c.ink3} style={{ marginTop: 4 }}>
                  次は {formatShortDate(nextDue.data, today.tz)}
                </AppText>
              )}
            </View>
          )}
        </Card>

        <Card style={{ overflow: 'hidden' }}>
          {list.map((f, i) => (
            <FolderRow
              key={f.id}
              folder={f}
              first={i === 0}
              onPress={() => router.push({ pathname: '/folders/[folderId]', params: { folderId: f.id } })}
              onLongPress={() => actions.folderMenu(f, f.cardCount)}
            />
          ))}
        </Card>

        <PressableScale
          testID="add-folder"
          accessibilityRole="button"
          onPress={() => actions.createFolder()}
          style={[styles.addRow, { borderColor: c.lineStrong }]}
        >
          <Icon name="add" color={c.ink2} />
          <AppText variant="button" color={c.ink2}>
            フォルダを追加
          </AppText>
        </PressableScale>
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: (hasFolders ? 120 : 40) + insets.bottom },
        ]}
      >
        <View style={styles.headerRow}>
          <AppText variant="button">akasheet</AppText>
          <AppText variant="sub" color={c.ink3}>
            {formatHeaderDate(today.now, today.tz)}
          </AppText>
        </View>
        <AppText variant="title" accessibilityRole="header" style={{ marginBottom: space[16] }}>
          フォルダ
        </AppText>
        {body}
      </ScrollView>
      {hasFolders && (
        <CaptureDock
          onCamera={() => actions.startCard('camera')}
          onLibrary={() => actions.startCard('library')}
        />
      )}
      <Toast spec={toast} onDone={flash.clear} bottom={hasFolders ? 100 + insets.bottom : 24} />
    </View>
  );
}

function FolderRow({
  folder,
  first,
  onPress,
  onLongPress,
}: {
  folder: FolderSummary;
  first: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { c } = useTheme();
  const today = useToday();
  const last = formatRelativeDay(folder.lastReviewedAt, today.now, today.tz);
  const sub =
    folder.cardCount === 0
      ? 'まだカードがありません'
      : `${folder.cardCount}枚${last ? `・${last} 復習` : ''}`;
  const badge =
    folder.dueCount > 0 ? (
      <Badge tone="due" label={`今日 ${formatCount(folder.dueCount)}`} />
    ) : folder.cardCount > 0 ? (
      <Badge tone="done" label="今日済 ✓" />
    ) : (
      <Badge tone="muted" label="0枚" />
    );
  return (
    <PressableScale
      testID={`folder-row-${folder.name}`}
      accessibilityRole="button"
      accessibilityLabel={`${folder.name}、${sub}${folder.dueCount > 0 ? `、今日 ${folder.dueCount}枚` : ''}`}
      accessibilityHint="長押しで名前の変更や削除"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={[styles.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
    >
      <FolderTab name={folder.name} color={folder.color} />
      <View style={{ flex: 1 }}>
        <AppText numberOfLines={2}>{folder.name}</AppText>
        <AppText variant="sub" color={c.ink3}>
          {sub}
        </AppText>
      </View>
      {badge}
      <Icon name="chevron-forward" color={c.ink3} size={18} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 16, gap: 12, width: '100%', maxWidth: 720, alignSelf: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 4 },
  hero: { padding: 20, overflow: 'hidden' },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 4 },
  sheetPiece: {
    position: 'absolute',
    right: -18,
    top: -14,
    width: 70,
    height: 56,
    borderRadius: 8,
    opacity: 0.1,
    transform: [{ rotate: '16deg' }],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: heights.row,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: heights.button,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
  },
});
