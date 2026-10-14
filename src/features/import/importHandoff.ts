import { createHandoff } from '@/features/app/handoff';
import type { ImportPreview } from '@/import/types';

export const pendingImportPreview = createHandoff<ImportPreview>();
