import { router } from 'expo-router';
import { useEffect } from 'react';

import { ImportPreviewScreen } from '@/features/import/ImportPreviewScreen';
import { pendingImportPreview } from '@/features/import/importHandoff';

export default function ImportPreviewRoute() {
  const preview = pendingImportPreview.peek();

  useEffect(() => {
    if (!preview) router.replace('/');
  }, [preview]);

  if (!preview) return null;
  return <ImportPreviewScreen preview={preview} />;
}
