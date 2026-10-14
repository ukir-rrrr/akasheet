import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * fullScreenModal routes must nest ModalRouteHost so DialogProvider's Modal is not hidden
 * under the native modal presentation (iOS editor folder sheet, review alerts, etc.).
 */
const MODAL_ROUTE_FILES = ['src/app/cards/new.tsx', 'src/app/review/[folderId].tsx'];

describe('ModalRouteHost on fullScreenModal routes', () => {
  it('wraps each modal route entry', () => {
    for (const rel of MODAL_ROUTE_FILES) {
      const src = readFileSync(join(__dirname, '..', '..', '..', rel), 'utf8');
      expect(src).toContain('ModalRouteHost');
    }
  });
});
