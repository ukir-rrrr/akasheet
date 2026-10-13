import { StyleSheet, View } from 'react-native';

import type { Folder } from '@/data/repos/folderRepo';
import { AppText, FolderTab, IconButton } from '@/ui/primitives';

type Props = {
  folder: Folder | undefined;
  paddingTop: number;
  onBack: () => void;
  onMenu: () => void;
};

export function FolderDetailHeader({ folder, paddingTop, onBack, onMenu }: Props) {
  return (
    <View style={[styles.header, { paddingTop }]}>
      <IconButton icon="chevron-back" label="戻る" onPress={onBack} testID="back" />
      {folder && <FolderTab name={folder.name} color={folder.color} size="sm" />}
      <AppText variant="section" numberOfLines={1} style={{ flex: 1 }} accessibilityRole="header">
        {folder?.name ?? ''}
      </AppText>
      <IconButton icon="ellipsis-horizontal" label="フォルダのメニュー" onPress={onMenu} />
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
});
