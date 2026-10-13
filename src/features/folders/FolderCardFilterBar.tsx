import { ScrollView, StyleSheet } from 'react-native';

import { AppText, PressableScale } from '@/ui/primitives';
import { radius, useTheme } from '@/ui/theme';

import { FOLDER_CARD_FILTERS, type FolderCardFilter } from './folderCardFilter';

type Props = {
  filter: FolderCardFilter;
  onFilter: (filter: FolderCardFilter) => void;
};

export function FolderCardFilterBar({ filter, onFilter }: Props) {
  const { c } = useTheme();

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {FOLDER_CARD_FILTERS.map((f) => {
        const on = filter === f.key;
        return (
          <PressableScale
            key={f.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => onFilter(f.key)}
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
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingVertical: 4 },
  chip: {
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.full,
    borderWidth: 1,
    justifyContent: 'center',
  },
});
