import { ModalRouteHost } from '@/features/app/ModalRouteHost';
import { ImportScreen } from '@/features/import/ImportScreen';

export default function ImportRoute() {
  return (
    <ModalRouteHost>
      <ImportScreen />
    </ModalRouteHost>
  );
}
