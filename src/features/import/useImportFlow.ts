import { router } from 'expo-router';
import { useCallback } from 'react';

import { useAppData } from '@/features/app/AppDataProvider';
import { buildImportPreview } from '@/import/detect';
import { errorMessage } from '@/shared/errors';
import { useDialogs } from '@/ui/dialogs';

import { pendingImportPreview } from './importHandoff';
import { pickImportFile } from './pickImportFile';

export function useImportFlow() {
  const app = useAppData();
  const dialogs = useDialogs();

  return useCallback(async () => {
    const pick = await pickImportFile();
    if (!pick) return;
    await dialogs.attempt('ファイルを読み込めませんでした', async () => {
      const preview = await buildImportPreview(pick, app.clock.now());
      if (preview.cards.length === 0) {
        throw new Error('取り込めるカードがありません（Image Occlusion / マスク列を確認してください）');
      }
      pendingImportPreview.set(preview);
      router.push('/import/preview');
    });
  }, [app, dialogs]);
}

export function importErrorMessage(e: unknown): string {
  return errorMessage(e);
}
