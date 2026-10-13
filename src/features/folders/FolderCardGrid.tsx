import { StyleSheet, View } from 'react-native';

import type { CardSummary } from '@/data/repos/cardRepo';
import { MaskThumb } from '@/features/canvas/MaskThumb';
import { formatShortDate } from '@/ui/format';
import { AppText, Badge, PressableScale } from '@/ui/primitives';
import { radius, useTheme } from '@/ui/theme';

type Props = {
  cards: CardSummary[];
  thumbWidth: number;
  dayEnd: number;
  tz: string;
  selected: string[] | null;
  onToggleSelect: (cardId: string) => void;
  onCardMenu: (card: CardSummary) => void;
};

function FolderCardCell({
  card,
  thumbWidth,
  dayEnd,
  tz,
  selected,
  isSel,
  onPress,
  onLongPress,
}: {
  card: CardSummary;
  thumbWidth: number;
  dayEnd: number;
  tz: string;
  selected: string[] | null;
  isSel: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { c } = useTheme();

  return (
    <PressableScale
      testID="card-thumb"
      accessibilityRole="button"
      accessibilityLabel={`カード ${card.title ?? formatShortDate(card.createdAt, tz)}、マスク${card.masks.length}個`}
      accessibilityState={selected ? { selected: isSel } : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
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
        {card.dueAt < dayEnd && (
          <View style={styles.thumbBadge}>
            <Badge tone="due" label="今日" />
          </View>
        )}
        {selected && (
          <View style={[styles.check, { backgroundColor: isSel ? c.ink : c.surface, borderColor: c.ink }]}>
            {isSel && (
              <AppText variant="caption" color={c.onInk}>
                ✓
              </AppText>
            )}
          </View>
        )}
      </View>
      <AppText variant="sub" numberOfLines={1} style={{ marginTop: 6 }}>
        {card.title ?? `${formatShortDate(card.createdAt, tz)} 追加`}
      </AppText>
      <AppText variant="caption" color={c.ink3}>
        {card.dueAt < dayEnd ? '今日' : `次回 ${formatShortDate(card.dueAt, tz)}`}
        ・マスク{card.masks.length}
      </AppText>
    </PressableScale>
  );
}

export function FolderCardGrid({
  cards,
  thumbWidth,
  dayEnd,
  tz,
  selected,
  onToggleSelect,
  onCardMenu,
}: Props) {
  return (
    <View style={styles.grid}>
      {cards.map((card) => {
        const isSel = selected?.includes(card.id) ?? false;
        return (
          <FolderCardCell
            key={card.id}
            card={card}
            thumbWidth={thumbWidth}
            dayEnd={dayEnd}
            tz={tz}
            selected={selected}
            isSel={isSel}
            onPress={() => selected && onToggleSelect(card.id)}
            onLongPress={() => (selected ? undefined : onCardMenu(card))}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
