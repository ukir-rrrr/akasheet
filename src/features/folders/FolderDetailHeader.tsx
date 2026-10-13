import { StyleSheet } from 'react-native';

import type { Folder } from '@/data/repos/folderRepo';
import { HeaderBar } from '@/ui/HeaderBar';
import { AppText, FolderTab, IconButton } from '@/ui/primitives';

type Props = {
  folder: Folder | undefined;
  onBack: () => void;
  onMenu: () => void;
};

export function FolderDetailHeader({ folder, onBack, onMenu }: Props) {
  return (
    <HeaderBar style={styles.header}>
      <IconButton icon="chevron-back" label="戻る" onPress={onBack} testID="back" />
      {folder && <FolderTab name={folder.name} color={folder.color} size="sm" />}
      <AppText
        variant="section"
        numberOfLines={1}
        style={{ flex: 1 }}
        accessibilityRole="header"
        testID="folder-detail-title"
      >
        {folder?.name ?? ''}
      </AppText>
      <IconButton
        icon="ellipsis-horizontal"
        label="フォルダのメニュー"
        onPress={onMenu}
        testID="folder-menu"
      />
    </HeaderBar>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 8,
    paddingBottom: 8,
  },
});
