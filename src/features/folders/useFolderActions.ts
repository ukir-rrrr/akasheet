import { router } from 'expo-router';
import { useCallback } from 'react';

import { useAppData } from '@/features/app/AppDataProvider';
import { useQueryInvalidation } from '@/features/app/queries';
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
  const { afterFolderCreate, afterFolderRename, afterFolderDelete } = useQueryInvalidation();

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
      return dialogs.attempt('作成できませんでした', async () => {
        const folder = await app.folders.create(name);
        await afterFolderCreate();
        return folder;
      });
    },
    [app, dialogs, afterFolderCreate],
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
      await dialogs.attempt('名前を変更できませんでした', async () => {
        await app.folders.rename(folder.id, name);
        await afterFolderRename(folder.id);
      });
    },
    [app, dialogs, afterFolderRename],
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
      const done = await dialogs.attempt('削除できませんでした', async () => {
        await app.folders.remove(folder.id);
        await afterFolderDelete(folder.id);
        return true;
      });
      return done === true;
    },
    [app, dialogs, afterFolderDelete],
  );

  const folderMenu = useCallback(
    async (folder: Folder, cardCount: number): Promise<'deleted' | null> => {
      haptic.medium();
      const choice = await dialogs.sheet({
        title: folder.name,
        actions: [
          { value: 'rename' as const, label: '名前を変更', icon: 'pencil-outline', testID: 'menu-rename' },
          {
            value: 'delete' as const,
            label: '削除',
            icon: 'trash-outline',
            destructive: true,
            hint: cardCount > 0 ? `${cardCount}枚も削除` : undefined,
            testID: 'menu-delete',
          },
        ],
      });
      if (choice === 'rename') await renameFolder(folder);
      if (choice === 'delete' && (await deleteFolder(folder, cardCount))) return 'deleted';
      return null;
    },
    [dialogs, renameFolder, deleteFolder],
  );

  const startCard = useCallback(
    async (source: PickSource, folderId?: string) => {
      const picked = await dialogs.attempt('写真を読み込めませんでした', () => pickImage(source, dialogs));
      if (!picked) return;
      pendingImage.set(picked);
      router.push(folderId ? { pathname: '/cards/new', params: { folderId } } : '/cards/new');
    },
    [dialogs],
  );

  const chooseSourceAndStart = useCallback(
    async (folderId?: string) => {
      const source = await dialogs.sheet<PickSource>({
        title: '写真からはじめる',
        actions: [
          { value: 'camera', label: '撮る', icon: 'camera-outline' },
          { value: 'library', label: '写真を選ぶ', icon: 'images-outline' },
          { value: 'sample', label: 'サンプルの教科書ページ', icon: 'book-outline', testID: 'source-sample' },
        ],
      });
      if (source === null) return;
      await startCard(source, folderId);
    },
    [dialogs, startCard],
  );

  return { createFolder, renameFolder, deleteFolder, folderMenu, startCard, chooseSourceAndStart };
}
