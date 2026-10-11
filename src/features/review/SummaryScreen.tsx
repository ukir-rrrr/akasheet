import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCard, useNextDue, useToday } from '@/features/app/queries';
import { MaskThumb } from '@/features/canvas/MaskThumb';
import { formatDateTime, formatShortDate } from '@/ui/format';
import { AppText, Button, PressableScale } from '@/ui/primitives';
import { heights, radius, useTheme } from '@/ui/theme';

import { sessionResult } from './sessionResult';

function AgainThumb({ cardId, onOpen }: { cardId: string; onOpen: () => void }) {
  const { c } = useTheme();
  const today = useToday();
  const card = useCard(cardId);
  if (!card.data) return <View style={[styles.thumb, { backgroundColor: c.surface2 }]} />;
  const d = card.data;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel="拡大して見る"
      onPress={onOpen}
      style={{ width: 96 }}
    >
      <MaskThumb
        rel={d.media.thumbPath}
        img={{ width: d.media.width, height: d.media.height }}
        masks={d.masks}
        style={styles.thumb}
      />
      <AppText variant="caption" color={c.ink3} numberOfLines={1} style={{ marginTop: 4 }}>
        {d.title ?? `${formatShortDate(d.createdAt, today.tz)}のカード`}
      </AppText>
    </PressableScale>
  );
}

function ZoomedCard({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const { c } = useTheme();
  const card = useCard(cardId);
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable
        style={[styles.zoomBackdrop, { backgroundColor: c.overlay }]}
        onPress={onClose}
        accessibilityLabel="閉じる"
      >
        {card.data && (
          <MaskThumb
            rel={card.data.media.path}
            img={{ width: card.data.media.width, height: card.data.media.height }}
            masks={card.data.masks}
            style={styles.zoomed}
          />
        )}
      </Pressable>
    </Modal>
  );
}

export function SummaryScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const today = useToday();
  const [result] = useState(() => sessionResult.get());
  const nextDue = useNextDue(result && result.folderId !== 'all' ? result.folderId : null);
  const [zoomId, setZoomId] = useState<string | null>(null);

  const backToFolder = () => {
    // The summary replaced the review modal, so the screen that started the review is right underneath.
    if (router.canGoBack()) router.back();
    else if (result && result.folderId !== 'all')
      router.replace({ pathname: '/folders/[folderId]', params: { folderId: result.folderId } });
    else router.replace('/');
  };

  if (!result) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <AppText>結果がありません</AppText>
        <Button label="フォルダに戻る" onPress={() => router.replace('/')} style={{ marginTop: 16 }} />
      </View>
    );
  }

  const pct = result.total > 0 ? Math.round((result.remembered / result.total) * 100) : 0;
  const minutes = Math.max(1, Math.round((result.endedAt - result.startedAt) / 60_000));
  const again = result.againIds.length;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 24, paddingBottom: 200 + insets.bottom },
        ]}
      >
        <AppText variant="sub" color={c.ink3}>
          復習完了
        </AppText>
        <AppText variant="headingMincho" accessibilityRole="header" testID="summary-title">
          おつかれさまでした
        </AppText>
        <AppText variant="sub" color={c.ink3}>
          {result.folderName}・{result.total}枚・{minutes}分
        </AppText>

        <View style={[styles.bigCard, { backgroundColor: c.surface }]}>
          <View style={styles.bigRow}>
            <AppText variant="heroMincho" testID="summary-remembered">
              {result.remembered}
            </AppText>
            <View>
              <AppText variant="section">覚えた</AppText>
              <AppText variant="sub" color={c.ink3}>
                {result.total}枚中・{pct}%
              </AppText>
            </View>
          </View>
          <View style={styles.ratio} accessibilityLabel={`覚えた ${result.remembered}枚、まだ ${again}枚`}>
            {result.remembered > 0 && (
              <View style={{ flex: result.remembered, backgroundColor: c.matcha, borderRadius: 2 }} />
            )}
            {again > 0 && (
              <View
                style={{
                  flex: again,
                  borderRadius: 2,
                  overflow: 'hidden',
                  backgroundColor: c.mask,
                  flexDirection: 'row',
                  gap: 3,
                }}
              >
                {Array.from({ length: 30 }, (_, i) => (
                  <View
                    key={i}
                    style={{ width: 2, backgroundColor: c.maskHatch, transform: [{ skewX: '-45deg' }] }}
                  />
                ))}
              </View>
            )}
          </View>
          <View style={styles.legend}>
            <AppText variant="caption" color={c.matchaInk}>
              ■ 覚えた {result.remembered}
            </AppText>
            <AppText variant="caption" color={c.shuInk}>
              ■ まだ {again}
            </AppText>
          </View>
        </View>

        {again > 0 && (
          <>
            <View style={styles.sectionRow}>
              <AppText variant="section">まだ {again}枚</AppText>
              <AppText variant="caption" color={c.ink3}>
                タップで拡大
              </AppText>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {result.againIds.map((id) => (
                <AgainThumb key={id} cardId={id} onOpen={() => setZoomId(id)} />
              ))}
            </ScrollView>
          </>
        )}

        <View style={[styles.nextCard, { backgroundColor: c.surface2 }]}>
          <AppText variant="sub" color={c.ink3}>
            次の期限
          </AppText>
          <AppText variant="section" style={{ marginTop: 4 }}>
            {nextDue.data != null ? formatDateTime(nextDue.data, today.tz) : '—'}
          </AppText>
          {result.pendingIn !== null && (
            <AppText variant="sub" color={c.ink2} style={{ marginTop: 4 }}>
              まだの{again}枚は {Math.max(1, Math.ceil(result.pendingIn / 60_000))} 分後に戻ってきます
            </AppText>
          )}
          {result.pendingIn === null && again > 0 && (
            <AppText variant="sub" color={c.ink2} style={{ marginTop: 4 }}>
              まだの{again}枚は 10 分後に戻ってきます
            </AppText>
          )}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: c.bg }]}>
        <Button label="フォルダに戻る" onPress={backToFolder} height={heights.cta} testID="summary-back" />
        {again > 0 && (
          <Button
            label="まだを もう一度"
            kind="ghost"
            icon="refresh"
            onPress={() =>
              router.replace({
                pathname: '/review/[folderId]',
                params: { folderId: result.folderId, ids: result.againIds.join(',') },
              })
            }
          />
        )}
      </View>
      {zoomId && <ZoomedCard cardId={zoomId} onClose={() => setZoomId(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, gap: 8, width: '100%', maxWidth: 640, alignSelf: 'center' },
  bigCard: { borderRadius: radius.lg, padding: 20, marginTop: 16, gap: 12 },
  bigRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ratio: { flexDirection: 'row', height: 6, gap: 2 },
  legend: { flexDirection: 'row', justifyContent: 'space-between' },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 16,
  },
  thumb: { width: 96, height: 128, borderRadius: radius.sm },
  nextCard: { borderRadius: radius.lg, padding: 16, marginTop: 16 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  zoomBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  zoomed: { width: '100%', height: '80%', borderRadius: radius.md },
});
