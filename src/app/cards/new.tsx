import { useLocalSearchParams } from 'expo-router';

import { ModalRouteHost } from '@/features/app/ModalRouteHost';
import { CardEditorScreen } from '@/features/editor/CardEditorScreen';

export default function NewCardRoute() {
  const { folderId } = useLocalSearchParams<{ folderId?: string }>();
  return (
    <ModalRouteHost>
      <CardEditorScreen initialFolderId={folderId} />
    </ModalRouteHost>
  );
}
