import { parseApkg } from './anki/parseApkg';
import { parseCsvOnly, parseCsvZip } from './csv/parseBundle';
import type { ImportPreview } from './types';

export type ImportPick =
  | { kind: 'apkg'; name: string; bytes: Uint8Array }
  | { kind: 'zip'; name: string; bytes: Uint8Array }
  | { kind: 'csv'; name: string; text: string };

export async function buildImportPreview(pick: ImportPick, nowMs: number): Promise<ImportPreview> {
  if (pick.kind === 'apkg') return parseApkg(pick.bytes, pick.name, nowMs);
  if (pick.kind === 'zip') return parseCsvZip(pick.bytes, pick.name);
  return parseCsvOnly(pick.text, pick.name, () => null);
}
