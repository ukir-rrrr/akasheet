import { router } from 'expo-router';
import { useCallback } from 'react';

import { useAppData } from '@/features/app/AppDataProvider';
import { useInvalidateAll } from '@/features/app/queries';
import { pendingImage, pickImage, type PickSource } from '@/features/cards/pickImage';
import { validateFolderName, type Folder } from '@/data/repos/folderRepo';
import { errorMessage } from '@/shared/errors';
import { useDialogs } from '@/ui/dialogs';
import { haptic } from '@/ui/haptics';

function nameError(v: string): string | null {
  try {
    validateFolderName(v);
    return null;
  } catch (e) {
    return errorMessage(e);
  }
}

export function useFolderActions() {
  const app = useAppData();
  const dialogs = useDialogs();
  const invalidate = useInvalidateAll();

  const createFolder = useCallback(
    async (presetName?: string): Promise<Folder | null> => {
      const name =
        presetName ??
        (await dialogs.prompt({
          title: 'フォルダを作成',
          message: '教科や単元の名前をつけましょう',
          placeholder: '例:日本史',
          confirmLabel: '作成',
          validate: nameError,
        }));
      if (name === null) return null;
      try {
        const folder = await app.folders.create(name);
        await invalidate();
        return folder;
      } catch (e) {
        await dialogs.alert('作成できませんでした', errorMessage(e));
        return null;
      }
    },
    [app, dialogs, invalidate],
  );

  const renameFolder = useCallback(
    async (folder: Folder) => {
      const name = await dialogs.prompt({
        title: '名前を変更',
        initial: folder.name,
        confirmLabel: '変更',
        validate: nameError,
      });
      if (name === null) return;
      await app.folders.rename(folder.id, name);
      await invalidate();
    },
    [app, dialogs, invalidate],
  );

  const deleteFolder = useCallback(
    async (folder: Folder, cardCount: number): Promise<boolean> => {
      haptic.warning();
      const ok = await dialogs.confirm({
        title: `「${folder.name}」を削除しますか?`,
        message: cardCount > 0 ? `中の${cardCount}枚のカードも削除されます。` : undefined,
        confirmLabel: cardCount > 0 ? `削除(${cardCount}枚も削除)` : '削除',
        destructive: true,
      });
      if (!ok) return false;
      await app.folders.remove(folder.id);
      await invalidate();
      return true;
    },
    [app, dialogs, invalidate],
  );

  const folderMenu = useCallback(
    async (folder: Folder, cardCount: number): Promise<'deleted' | null> => {
      haptic.medium();
      const choice = await dialogs.sheet({
        title: folder.name,
        actions: [
          { label: '名前を変更', icon: 'pencil-outline', testID: 'menu-rename' },
          {
            label: '削除',
            icon: 'trash-outline',
            destructive: true,
            hint: cardCount > 0 ? `${cardCount}枚も削除` : undefined,
            testID: 'menu-delete',
          },
        ],
      });
      if (choice === 0) await renameFolder(folder);
      if (choice === 1 && (await deleteFolder(folder, cardCount))) return 'deleted';
      return null;
    },
    [dialogs, renameFolder, deleteFolder],
  );

  const startCard = useCallback(
    async (source: PickSource, folderId?: string) => {
      const picked = await pickImage(source, dialogs);
      if (!picked) return;
      pendingImage.set(picked);
      router.push(folderId ? { pathname: '/cards/new', params: { folderId } } : '/cards/new');
    },
    [dialogs],
  );

  const chooseSourceAndStart = useCallback(
    async (folderId?: string) => {
      const choice = await dialogs.sheet({
        title: '写真からはじめる',
        actions: [
          { label: '撮る', icon: 'camera-outline' },
          { label: '写真を選ぶ', icon: 'images-outline' },
          { label: 'サンプルの教科書ページ', icon: 'book-outline', testID: 'source-sample' },
        ],
      });
      if (choice === null) return;
      await startCard((['camera', 'library', 'sample'] as const)[choice], folderId);
    },
    [dialogs, startCard],
  );

  return { createFolder, renameFolder, deleteFolder, folderMenu, startCard, chooseSourceAndStart };
}
