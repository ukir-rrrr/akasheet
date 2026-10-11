import { useLocalSearchParams } from 'expo-router';

import { ReviewScreen } from '@/features/review/ReviewScreen';

export default function ReviewRoute() {
  const { folderId, ids } = useLocalSearchParams<{ folderId: string; ids?: string }>();
  return <ReviewScreen folderParam={folderId} onlyCardIds={ids ? ids.split(',').filter(Boolean) : null} />;
}
