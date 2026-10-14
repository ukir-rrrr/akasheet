import { detectImportKind, parseApkgBytes, parseCsvFile, parseCsvZipBytes } from '@/import/apkg';
import { openAnkiCollectionDb } from '@/import/openAnkiCollectionDb';
import type { ParsedImportBundle } from '@/import/types';

async function readUriBytes(uri: string): Promise<Uint8Array> {
  const { File } = await import('expo-file-system');
  const file = new File(uri);
  const buf = await file.bytes();
  return new Uint8Array(buf);
}

export async function parseImportFromUri(
  uri: string,
  fileName: string,
  mimeType?: string | null,
): Promise<ParsedImportBundle> {
  const kind = detectImportKind(fileName, mimeType);
  if (!kind) throw new Error('対応していないファイル形式です（.apkg / .csv / .zip）');
  const bytes = await readUriBytes(uri);
  if (kind === 'apkg') {
    return await parseApkgBytes(bytes, openAnkiCollectionDb, fileName);
  }
  if (kind === 'zip') {
    return parseCsvZipBytes(bytes, fileName);
  }
  const text = new TextDecoder().decode(bytes);
  return parseCsvFile(text, fileName);
}
