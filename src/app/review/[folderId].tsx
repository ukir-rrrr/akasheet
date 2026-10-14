import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ModalRouteHost } from '@/features/app/ModalRouteHost';
import { ReviewScreen } from '@/features/review/ReviewScreen';
import { consumeReviewLaunch, resolveReviewRoute } from '@/features/review/reviewLaunch';

export default function ReviewRoute() {
  const params = useLocalSearchParams<{ folderId: string; ids?: string }>();
  const [resolved] = useState(() => resolveReviewRoute(consumeReviewLaunch(), params));
  return (
    <ModalRouteHost>
      <ReviewScreen
        folderId={resolved.folderId}
        folderName={resolved.folderName}
        onlyCardIds={resolved.onlyCardIds}
        launchKey={resolved.launchKey}
      />
    </ModalRouteHost>
  );
}
