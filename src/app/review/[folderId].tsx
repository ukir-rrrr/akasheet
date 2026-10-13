import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ReviewScreen } from '@/features/review/ReviewScreen';
import { consumeReviewLaunch, resolveReviewRoute } from '@/features/review/reviewLaunch';

export default function ReviewRoute() {
  const params = useLocalSearchParams<{ folderId: string; ids?: string }>();
  const [resolved] = useState(() => resolveReviewRoute(consumeReviewLaunch(), params));
  return (
    <ReviewScreen
      folderId={resolved.folderId}
      folderName={resolved.folderName}
      onlyCardIds={resolved.onlyCardIds}
      launchKey={resolved.launchKey}
    />
  );
}
