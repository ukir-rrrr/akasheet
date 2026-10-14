import type { SqlReader } from './ankiCollection';
import { parseAnkiCollection } from './ankiCollection';
import { parseCsvImport } from './csv';
import type { ParsedImportBundle } from './types';
import { unzipToMap, type NamedBytes } from './zipEntries';

function collectionBytes(entries: NamedBytes): Uint8Array {
  const db =
    entries.get('collection.anki21b') ?? entries.get('collection.anki21') ?? entries.get('collection.anki2');
  if (!db) throw new Error('.apkg に collection データベースがありません');
  return db;
}

export type OpenCollectionDb = (sqliteBytes: Uint8Array) => Promise<SqlReader>;

/** Parses .apkg bytes using an injected SQLite opener (native / test). */
export async function parseApkgBytes(
  bytes: Uint8Array,
  openDb: OpenCollectionDb,
  label: string,
): Promise<ParsedImportBundle> {
  const entries = unzipToMap(bytes);
  const db = await openDb(collectionBytes(entries));
  return await parseAnkiCollection(db, entries, label);
}

export function parseCsvZipBytes(bytes: Uint8Array, label: string): ParsedImportBundle {
  const entries = unzipToMap(bytes);
  const csvPath = [...entries.keys()].find((k) => k.toLowerCase().endsWith('.csv'));
  if (!csvPath) throw new Error('zip に CSV ファイルがありません');
  const csvText = new TextDecoder().decode(entries.get(csvPath)!);
  const imageEntries = new Map<string, Uint8Array>();
  for (const [k, v] of entries) {
    if (k === csvPath) continue;
    if (/\.(jpe?g|png|webp)$/i.test(k)) imageEntries.set(k, v);
  }
  return parseCsvImport(csvText, imageEntries, label);
}

export function parseCsvFile(csvText: string, label: string): ParsedImportBundle {
  return parseCsvImport(csvText, new Map(), label);
}

export function detectImportKind(fileName: string, mime?: string | null): 'apkg' | 'csv' | 'zip' | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.apkg') || mime === 'application/apkg') return 'apkg';
  if (lower.endsWith('.csv') || mime === 'text/csv' || mime === 'text/comma-separated-values') return 'csv';
  if (lower.endsWith('.zip') || mime === 'application/zip') return 'zip';
  return null;
}
