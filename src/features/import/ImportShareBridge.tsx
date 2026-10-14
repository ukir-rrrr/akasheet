import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect, useRef } from 'react';

import { pendingImportFile } from './pendingImport';

/** Routes OS share / open-with payloads into the import flow. */
export function ImportShareBridge() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const handling = useRef(false);

  useEffect(() => {
    if (!hasShareIntent || handling.current) return;
    const file = shareIntent.files?.[0];
    if (!file?.path) return;
    handling.current = true;
    pendingImportFile.set({
      uri: file.path,
      fileName: file.fileName ?? 'import',
      mimeType: file.mimeType,
    });
    resetShareIntent();
    router.push('/import');
    handling.current = false;
  }, [hasShareIntent, shareIntent, resetShareIntent]);

  return null;
}
