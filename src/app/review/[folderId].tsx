import { useLocalSearchParams } from 'expo-router';

import { ALL_FOLDERS, ReviewScreen } from '@/features/review/ReviewScreen';

export default function ReviewRoute() {
  const { folderId, ids } = useLocalSearchParams<{ folderId: string; ids?: string }>();
  return (
    <ReviewScreen
      folderId={folderId === ALL_FOLDERS ? null : folderId}
      onlyCardIds={ids ? ids.split(',').filter(Boolean) : null}
    />
  );
}
