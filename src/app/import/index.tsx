import { ImportWizardScreen } from '@/features/import/ImportWizardScreen';
import { ModalRouteHost } from '@/features/app/ModalRouteHost';

export default function ImportRoute() {
  return (
    <ModalRouteHost>
      <ImportWizardScreen />
    </ModalRouteHost>
  );
}
