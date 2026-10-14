import { createHandoff } from '@/features/app/handoff';
import type { ParsedImportBundle } from '@/import/types';

export const pendingImport = createHandoff<ParsedImportBundle>();

export type ImportFileRef = { uri: string; fileName: string; mimeType?: string | null };

export const pendingImportFile = createHandoff<ImportFileRef>();
