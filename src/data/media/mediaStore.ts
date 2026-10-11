import { platformBackend } from './backend';
import { createMediaStore } from './store';

export const mediaStore = createMediaStore(platformBackend);
