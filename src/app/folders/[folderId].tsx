import { useLocalSearchParams } from 'expo-router';

import { FolderDetailScreen } from '@/features/folders/FolderDetailScreen';

export default function FolderRoute() {
  const { folderId } = useLocalSearchParams<{ folderId: string }>();
  return <FolderDetailScreen folderId={folderId} />;
}
