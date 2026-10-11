import { useLocalSearchParams } from 'expo-router';

import { ALL_FOLDERS, MAX_REPLAY_CARD_IDS } from '@/features/review/constants';
import { ReviewScreen } from '@/features/review/ReviewScreen';

export default function ReviewRoute() {
  const { folderId, ids } = useLocalSearchParams<{ folderId: string; ids?: string }>();
  const replayParam = ids && ids.length <= 16_000 ? ids : undefined;
  const replayIds = replayParam ? replayParam.split(',').filter(Boolean).slice(0, MAX_REPLAY_CARD_IDS) : null;
  return (
    <ReviewScreen
      folderId={folderId === ALL_FOLDERS ? null : folderId}
      onlyCardIds={replayParam ? replayIds : null}
    />
  );
}
