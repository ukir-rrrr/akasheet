import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { SlideInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SM2B } from '@/domain/scheduler/sm2b';
import type { Rating, ReviewState } from '@/domain/scheduler/types';
import { goBackOr } from '@/features/app/navigation';
import { useFolder, useNextDue, useToday } from '@/features/app/queries';
import { errorMessage } from '@/shared/errors';
import { useDialogs } from '@/ui/dialogs';
import { formatInterval, formatShortDate } from '@/ui/format';
import { haptic } from '@/ui/haptics';
import { PaperIllustration } from '@/ui/PaperIllustration';
import { HeaderBar } from '@/ui/HeaderBar';
import { AppText, Button, ErrorState, Icon, IconButton, PressableScale } from '@/ui/primitives';
import { heights, radius, useTheme } from '@/ui/theme';
import { Toast, type ToastSpec } from '@/ui/Toast';

import { ReviewCanvas } from './ReviewCanvas';
import { sessionResult } from './sessionResult';
import { useReviewSession, type CardView } from './useReviewSession';

const UNDO_WINDOW_MS = 5000;

/** `folderId` null = all folders; `onlyCardIds` = 「まだを もう一度」. */
export function ReviewScreen({
  folderId,
  folderName: folderNameHandoff,
  onlyCardIds,
  launchKey,
}: {
  folderId: string | null;
  /** From review launch hand-off; when null the folder name is loaded from the query cache. */
  folderName: string | null;
  onlyCardIds: string[] | null;
  launchKey: string;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const dialogs = useDialogs();
  const today = useToday();
  const folder = useFolder(folderId);
  const r = useReviewSession(folderId, onlyCardIds, launchKey);
  const [stagger, setStagger] = useState<string[] | undefined>(undefined);
  const folderName = folderNameHandoff ?? (folderId ? (folder.data?.name ?? '') : 'すべてのフォルダ');
  const view = r.view;

  const close = () => goBackOr('/');
  const finish = () => {
    r.clearLast();
    sessionResult.set(r.result(folderName));
    router.replace('/review/summary');
  };

  const last = r.last;
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

  const onAnswer = async (rating: Rating) => {
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

  if (view.kind === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
        <ErrorState onRetry={view.retry} />
      </View>
    );
  }
  if (view.kind === 'empty') return <NothingDue folderId={folderId} onClose={close} />;

  const progress = view.kind === 'card' || view.kind === 'wrappingUp' ? view.progress : null;
  const cardTitle = view.kind === 'card' ? view.card?.title : null;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <HeaderBar topGap={2} horizontal={4} style={styles.top}>
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
      </HeaderBar>
      <View style={[styles.track, { backgroundColor: c.surface2 }]}>
        <View
          style={{
            height: 4,
            backgroundColor: c.ink,
            width: progress ? `${((progress.index - 1) / Math.max(1, progress.total)) * 100}%` : '0%',
          }}
        />
      </View>

      {view.kind === 'wrappingUp' && <WrappingUp onFinish={finish} />}
      {view.kind === 'loading' && <View style={{ flex: 1 }} />}
      {view.kind === 'card' && (
        <CardStage
          view={view}
          stagger={stagger}
          onToggle={(id) => {
            haptic.selection();
            r.toggle(id);
          }}
        />
      )}
      {view.kind === 'card' && (
        <AnswerZone
          view={view}
          busy={r.busy}
          now={today.now}
          tz={today.tz}
          onRevealNext={() => {
            haptic.selection();
            setStagger(undefined);
            r.revealNext();
          }}
          onRevealAll={(unrevealed) => {
            haptic.light();
            setStagger(unrevealed);
            r.revealAll();
          }}
          onAnswer={onAnswer}
        />
      )}
      <Toast
        spec={toast}
        onDone={(reason) => {
          r.clearLast();
          // The final answer's undo window has passed without an undo: move on to the summary.
          if (reason === 'timeout' && view.kind === 'wrappingUp') finish();
        }}
        bottom={insets.bottom + (view.kind === 'wrappingUp' ? 24 : 180)}
      />
    </View>
  );
}

function NothingDue({ folderId, onClose }: { folderId: string | null; onClose: () => void }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const today = useToday();
  const nextDue = useNextDue(folderId);
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
        onPress={onClose}
        height={heights.cta}
        style={{ alignSelf: 'stretch', marginTop: 28 }}
      />
    </View>
  );
}

function WrappingUp({ onFinish }: { onFinish: () => void }) {
  const { c } = useTheme();
  return (
    <View style={styles.center} testID="review-wrapping-up">
      <Icon name="checkmark-circle" size={48} color={c.matcha} />
      <AppText variant="headingMincho" style={{ marginTop: 16, textAlign: 'center' }}>
        今日の分が終わりました
      </AppText>
      <AppText variant="sub" color={c.ink3} style={{ marginTop: 8, textAlign: 'center' }}>
        最後の回答は数秒のあいだ取り消せます
      </AppText>
      <Button
        label="結果を見る"
        onPress={onFinish}
        height={heights.cta}
        style={{ alignSelf: 'stretch', marginTop: 28 }}
        testID="see-summary"
      />
    </View>
  );
}

function CardStage({
  view,
  stagger,
  onToggle,
}: {
  view: CardView;
  stagger: string[] | undefined;
  onToggle: (maskId: string) => void;
}) {
  const { c } = useTheme();
  const card = view.card;
  const unrevealed = view.orderedIds.filter((id) => !view.revealed.has(id)).length;
  return (
    <View style={{ flex: 1 }}>
      {card && (
        <Animated.View
          key={`${view.cardId}-${view.progress.index}`}
          entering={SlideInRight.duration(220)}
          style={{ flex: 1 }}
        >
          <ReviewCanvas
            rel={card.media.path}
            img={{ width: card.media.width, height: card.media.height }}
            masks={view.masks}
            revealed={view.revealed}
            staggerIds={stagger}
            onToggle={onToggle}
          />
        </Animated.View>
      )}
      {card && (
        <View pointerEvents="none" style={styles.pillWrap}>
          <View style={[styles.pill, { backgroundColor: c.overlay }]}>
            <AppText variant="caption" color="#FFFFFF" testID="remaining">
              {unrevealed > 0
                ? `朱をタップでめくる・残り ${unrevealed} / ${view.masks.length}`
                : 'すべてめくりました'}
            </AppText>
          </View>
        </View>
      )}
      {card && card.invalidMaskCount > 0 && (
        <View style={[styles.warn, { backgroundColor: c.overlay }]}>
          <AppText variant="caption" color="#FFFFFF">
            読み込めないマスクが{card.invalidMaskCount}個あります
          </AppText>
        </View>
      )}
    </View>
  );
}

/** Fuzz is decided at answer time, so intervals it can change are shown as approximate. */
function intervalCaption(now: number, s: ReviewState, tz: string): string {
  const text = formatInterval(now, s.dueAt, tz);
  return s.phase === 'review' && s.intervalDays >= SM2B.FUZZ_MIN_INTERVAL ? `約${text}` : text;
}

function AnswerZone({
  view,
  busy,
  now,
  tz,
  onRevealNext,
  onRevealAll,
  onAnswer,
}: {
  view: CardView;
  busy: boolean;
  now: number;
  tz: string;
  onRevealNext: () => void;
  onRevealAll: (unrevealed: string[]) => void;
  onAnswer: (rating: Rating) => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const unrevealed = view.orderedIds.filter((id) => !view.revealed.has(id));
  const nextNumber = view.masks.find((m) => !view.revealed.has(m.id))?.ord;
  const noneRevealed = unrevealed.length === view.masks.length && view.masks.length > 0;
  const againCaption = view.preview ? intervalCaption(now, view.preview[1], tz) : '';
  const goodCaption = view.preview ? intervalCaption(now, view.preview[3], tz) : '';
  const allRevealed = unrevealed.length === 0;
  return (
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
          accessibilityLabel={nextNumber !== undefined ? `次をめくる、答え ${nextNumber + 1}` : '次をめくる'}
          disabled={allRevealed}
          onPress={onRevealNext}
          style={[styles.secondary, { borderColor: c.lineStrong, opacity: allRevealed ? 0.45 : 1 }]}
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
          disabled={allRevealed}
          onPress={() => onRevealAll(unrevealed)}
          style={[styles.secondary, { borderColor: c.lineStrong, opacity: allRevealed ? 0.45 : 1 }]}
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
          disabled={busy || !view.card}
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
          disabled={busy || !view.card}
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
            {goodCaption ? `次は${goodCaption}` : ''}
          </AppText>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  top: { paddingBottom: 6 },
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
