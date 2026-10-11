import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { SlideInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppData } from '@/features/app/AppDataProvider';
import { useFolder, useNextDue, useToday } from '@/features/app/queries';
import { PaperIllustration } from '@/features/folders/EmptyFolders';
import { errorMessage } from '@/shared/errors';
import { useDialogs } from '@/ui/dialogs';
import { formatInterval, formatShortDate } from '@/ui/format';
import { haptic } from '@/ui/haptics';
import { AppText, Button, ErrorState, Icon, IconButton, PressableScale } from '@/ui/primitives';
import { heights, radius, useTheme } from '@/ui/theme';
import { Toast, type ToastSpec } from '@/ui/Toast';

import { ReviewCanvas } from './ReviewCanvas';
import { sessionResult } from './sessionResult';
import { useReviewSession } from './useReviewSession';

const UNDO_WINDOW_MS = 5000;

export function ReviewScreen({
  folderParam,
  onlyCardIds,
}: {
  folderParam: string;
  onlyCardIds: string[] | null;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const app = useAppData();
  const dialogs = useDialogs();
  const today = useToday();
  const folderId = folderParam === 'all' ? null : folderParam;
  const folder = useFolder(folderId ?? '');
  const nextDue = useNextDue(folderId);
  const r = useReviewSession(folderId, onlyCardIds);
  const last = r.last;
  const undoOpen = last !== null;
  const toast: ToastSpec | null = last && {
    id: last.at,
    message: `${last.rating === 3 ? '✓ 覚えた' : '↺ まだ'}・${formatInterval(last.at, last.next.dueAt, today.tz)}`,
    actionLabel: '取り消す',
    actionIcon: 'arrow-undo',
    durationMs: UNDO_WINDOW_MS,
    onAction: () => {
      haptic.light();
      r.undo().catch((e) => dialogs.alert('取り消せませんでした', errorMessage(e)));
    },
  };
  const [stagger, setStagger] = useState<string[] | undefined>(undefined);
  const folderName = folderId ? (folder.data?.name ?? '') : 'すべてのフォルダ';

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  useEffect(() => {
    if (!r.finished || !r.session || r.session.answers.length === 0) return;
    sessionResult.set({
      folderId: folderParam,
      folderName,
      total: r.stats.total,
      remembered: r.stats.remembered,
      againIds: r.stats.again,
      startedAt: r.startedAt,
      endedAt: app.ctx.clock.now(),
      pendingIn: r.pendingIn,
    });
    // Leave time for the undo toast of the final answer before moving on.
    const t = setTimeout(() => router.replace('/review/summary'), undoOpen ? UNDO_WINDOW_MS : 0);
    return () => clearTimeout(t);
  }, [r.finished, r.session, r.stats, r.startedAt, r.pendingIn, folderParam, folderName, app, undoOpen]);

  const onAnswer = async (rating: 1 | 3) => {
    try {
      if (rating === 3) haptic.success();
      else haptic.light();
      await r.answer(rating);
      setStagger(undefined);
    } catch (e) {
      await dialogs.alert(
        '回答を保存できませんでした',
        `${errorMessage(e)}\nこのカードのまま、もう一度お試しください。`,
      );
    }
  };

  if (r.loadError) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
        <ErrorState onRetry={r.reload} />
      </View>
    );
  }

  const empty = r.session && r.session.answers.length === 0 && r.finished;
  if (empty) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg, paddingTop: insets.top }]}>
        <PaperIllustration />
        <AppText variant="headingMincho" style={{ marginTop: 24, textAlign: 'center' }}>
          今日の復習はありません
        </AppText>
        {nextDue.data != null && (
          <AppText variant="sub" color={c.ink3} style={{ marginTop: 8 }}>
            次は {formatShortDate(nextDue.data, today.tz)}
          </AppText>
        )}
        <Button
          label="フォルダに戻る"
          onPress={close}
          height={heights.cta}
          style={{ alignSelf: 'stretch', marginTop: 28 }}
        />
      </View>
    );
  }

  const unrevealed = r.orderedIds.filter((id) => !r.revealed.has(id));
  const nextNumber = r.masks.find((m) => !r.revealed.has(m.id))?.ord;
  const noneRevealed = unrevealed.length === r.masks.length && r.masks.length > 0;
  const preview = r.preview;
  const now = today.now;
  const againCaption = preview ? formatInterval(now, preview[1].dueAt, today.tz) : '';
  const goodCaption = preview ? formatInterval(now, preview[3].dueAt, today.tz) : '';
  const progress = r.progress;
  const cardTitle = r.card.data?.title;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={[styles.top, { paddingTop: insets.top + 2 }]}>
        <IconButton icon="close" label="復習を終える" onPress={close} testID="review-close" />
        <AppText variant="sub" color={c.ink2} style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
          {folderName}
          {cardTitle ? `・${cardTitle}` : ''}
        </AppText>
        <AppText
          variant="button"
          style={{ fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'right', paddingRight: 8 }}
          accessibilityLabel={progress ? `${progress.total}枚中 ${progress.index}枚目` : undefined}
          testID="review-progress"
        >
          {progress ? `${Math.min(progress.index, progress.total)} / ${progress.total}` : ''}
        </AppText>
      </View>
      <View style={[styles.track, { backgroundColor: c.surface2 }]}>
        <View
          style={{
            height: 4,
            backgroundColor: c.ink,
            width: progress ? `${((progress.index - 1) / Math.max(1, progress.total)) * 100}%` : '0%',
          }}
        />
      </View>

      <View style={{ flex: 1 }}>
        {r.card.data && r.cardId && (
          <Animated.View
            key={`${r.cardId}-${r.session?.answers.length}`}
            entering={SlideInRight.duration(220)}
            style={{ flex: 1 }}
          >
            <ReviewCanvas
              rel={r.card.data.media.path}
              img={{ width: r.card.data.media.width, height: r.card.data.media.height }}
              masks={r.masks}
              revealed={r.revealed}
              staggerIds={stagger}
              onToggle={(id) => {
                haptic.selection();
                r.toggle(id);
              }}
            />
          </Animated.View>
        )}
        {r.card.data && (
          <View pointerEvents="none" style={styles.pillWrap}>
            <View style={[styles.pill, { backgroundColor: c.overlay }]}>
              <AppText variant="caption" color="#FFFFFF" testID="remaining">
                {unrevealed.length > 0
                  ? `朱をタップでめくる・残り ${unrevealed.length} / ${r.masks.length}`
                  : 'すべてめくりました'}
              </AppText>
            </View>
          </View>
        )}
        {r.card.data && r.card.data.invalidMaskCount > 0 && (
          <View style={[styles.warn, { backgroundColor: c.overlay }]}>
            <AppText variant="caption" color="#FFFFFF">
              読み込めないマスクが{r.card.data.invalidMaskCount}個あります
            </AppText>
          </View>
        )}
      </View>

      <View
        style={[
          styles.thumbZone,
          { paddingBottom: insets.bottom + 12, backgroundColor: c.surface, borderTopColor: c.line },
        ]}
      >
        <View style={styles.row}>
          <PressableScale
            testID="reveal-next"
            accessibilityRole="button"
            accessibilityLabel={
              nextNumber !== undefined ? `次をめくる、答え ${nextNumber + 1}` : '次をめくる'
            }
            disabled={unrevealed.length === 0}
            onPress={() => {
              haptic.selection();
              setStagger(undefined);
              r.revealNext();
            }}
            style={[
              styles.secondary,
              { borderColor: c.lineStrong, opacity: unrevealed.length === 0 ? 0.45 : 1 },
            ]}
          >
            {nextNumber !== undefined && (
              <View style={[styles.chip, { backgroundColor: c.shuInk }]}>
                <AppText variant="caption" color="#FFFFFF">
                  {nextNumber + 1}
                </AppText>
              </View>
            )}
            <AppText variant="button">次をめくる</AppText>
          </PressableScale>
          <PressableScale
            testID="reveal-all"
            accessibilityRole="button"
            disabled={unrevealed.length === 0}
            onPress={() => {
              haptic.light();
              setStagger(unrevealed);
              r.revealAll();
            }}
            style={[
              styles.secondary,
              { borderColor: c.lineStrong, opacity: unrevealed.length === 0 ? 0.45 : 1 },
            ]}
          >
            <Icon name="layers-outline" size={18} />
            <AppText variant="button">全部めくる</AppText>
          </PressableScale>
        </View>
        <View style={[styles.row, { opacity: noneRevealed ? 0.6 : 1 }]}>
          <PressableScale
            testID="answer-again"
            accessibilityRole="button"
            accessibilityLabel={`まだ、${againCaption}`}
            disabled={r.busy || !r.cardId}
            onPress={() => onAnswer(1)}
            style={[styles.answer, { backgroundColor: c.shuTint, borderWidth: 2, borderColor: c.mask }]}
          >
            <View style={styles.answerLabel}>
              <Icon name="refresh" color={c.shuTintInk} size={20} />
              <AppText variant="answer" color={c.shuTintInk}>
                まだ
              </AppText>
            </View>
            <AppText variant="caption" color={c.shuTintInk}>
              {againCaption}
            </AppText>
          </PressableScale>
          <PressableScale
            testID="answer-good"
            accessibilityRole="button"
            accessibilityLabel={`覚えた、次は${goodCaption}`}
            disabled={r.busy || !r.cardId}
            onPress={() => onAnswer(3)}
            style={[styles.answer, { backgroundColor: c.matcha }]}
          >
            <View style={styles.answerLabel}>
              <Icon name="checkmark" color="#FFFFFF" size={22} />
              <AppText variant="answer" color="#FFFFFF">
                覚えた
              </AppText>
            </View>
            <AppText variant="caption" color="#FFFFFF">
              次は{goodCaption}
            </AppText>
          </PressableScale>
        </View>
      </View>
      <Toast spec={toast} onDone={r.clearLast} bottom={insets.bottom + 180} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 6 },
  track: { height: 4 },
  pillWrap: { position: 'absolute', bottom: 12, left: 0, right: 0, alignItems: 'center' },
  pill: { borderRadius: radius.full, paddingHorizontal: 12, paddingVertical: 6 },
  warn: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  thumbZone: { paddingHorizontal: 16, paddingTop: 12, gap: 12, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  secondary: {
    flex: 1,
    height: heights.button,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chip: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  answer: {
    flex: 1,
    height: heights.answer,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  answerLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
