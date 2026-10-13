import { StyleSheet, View } from 'react-native';

import { pushReview } from '@/features/review/reviewNavigation';
import { AppText, Button, Card } from '@/ui/primitives';
import { formatShortDate } from '@/ui/format';
import { heights, useTheme } from '@/ui/theme';

type Props = {
  folderId: string;
  folderName: string | null;
  dueCount: number;
  totalCount: number;
  nextDueAt: number | null | undefined;
  tz: string;
};

export function FolderReviewSection({ folderId, folderName, dueCount, totalCount, nextDueAt, tz }: Props) {
  const { c } = useTheme();

  return (
    <>
      <View style={styles.stats}>
        <Card style={styles.stat}>
          <AppText variant="sub" color={c.ink3}>
            今日
          </AppText>
          <AppText variant="hero" color={dueCount > 0 ? c.shuInk : c.ink} style={{ fontSize: 34 }}>
            {dueCount}
          </AppText>
        </Card>
        <Card style={styles.stat}>
          <AppText variant="sub" color={c.ink3}>
            全
          </AppText>
          <AppText variant="hero" style={{ fontSize: 34 }}>
            {totalCount}
          </AppText>
        </Card>
      </View>
      <Button
        label={
          dueCount > 0
            ? `復習をはじめる(${dueCount})`
            : nextDueAt
              ? `次は ${formatShortDate(nextDueAt, tz)}`
              : '復習するカードはありません'
        }
        disabled={dueCount === 0}
        height={heights.cta}
        onPress={() => pushReview({ folderId, folderName, onlyCardIds: null })}
        testID="start-review"
      />
    </>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, padding: 16 },
});
