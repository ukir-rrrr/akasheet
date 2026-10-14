import type { ReactNode } from 'react';

import { DialogProvider } from '@/ui/dialogs';

/**
 * Expo Router `presentation: 'fullScreenModal'` screens are hosted in a native modal layer.
 * The root `DialogProvider` `Modal` renders underneath that layer on iOS, so sheets/alerts
 * from editor/review never appear. Nest a provider on each modal route so dialogs mount
 * inside the same presentation.
 */
export function ModalRouteHost({ children }: { children: ReactNode }) {
  return <DialogProvider>{children}</DialogProvider>;
}
