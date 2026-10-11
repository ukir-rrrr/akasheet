import { useLocalSearchParams } from 'expo-router';

import { CardEditorScreen } from '@/features/editor/CardEditorScreen';

export default function NewCardRoute() {
  const { folderId } = useLocalSearchParams<{ folderId?: string }>();
  return <CardEditorScreen initialFolderId={folderId} />;
}
