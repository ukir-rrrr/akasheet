import { StyleSheet, View } from 'react-native';

import { AppText, Button } from '@/ui/primitives';

type Props = {
  selectedCount: number;
  paddingBottom: number;
  borderTopColor: string;
  backgroundColor: string;
  onCancel: () => void;
  onMove: () => void;
  onDelete: () => void;
};

export function FolderSelectionBar({
  selectedCount,
  paddingBottom,
  borderTopColor,
  backgroundColor,
  onCancel,
  onMove,
  onDelete,
}: Props) {
  return (
    <View style={[styles.selectBar, { backgroundColor, paddingBottom, borderTopColor }]}>
      <Button label="やめる" kind="ghost" onPress={onCancel} />
      <AppText variant="sub" style={{ flex: 1, textAlign: 'center' }}>
        {selectedCount}枚を選択中
      </AppText>
      <Button
        label="移動"
        kind="secondary"
        icon="folder-open-outline"
        disabled={selectedCount === 0}
        onPress={onMove}
      />
      <Button
        label="削除"
        kind="secondary"
        icon="trash-outline"
        disabled={selectedCount === 0}
        onPress={onDelete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
