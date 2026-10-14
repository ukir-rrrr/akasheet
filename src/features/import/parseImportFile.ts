import { strFromU8 } from 'fflate';
import { openDatabaseAsync } from 'expo-sqlite';

import { parseAnkiCollection } from '@/import/anki/parseCollection';
import type { AnkiSql } from '@/import/anki/sqlTypes';
import { unpackApkg } from '@/import/anki/unpackApkg';
import { parseCsvBundle } from '@/import/csv/parseCsvBundle';
import type { ImportFormat, ParsedImportBundle } from '@/import/types';

import { writeImportImageBytes } from '@/data/importMedia';

function expoSqlAdapter(db: Awaited<ReturnType<typeof openDatabaseAsync>>): AnkiSql {
  return {
    async get<T>(sql: string, params: readonly unknown[] = []) {
      return (await db.getFirstAsync<T>(sql, params as (string | number | null)[])) ?? undefined;
    },
    async all<T>(sql: string, params: readonly unknown[] = []) {
      return db.getAllAsync<T>(sql, params as (string | number | null)[]);
    },
  };
}

async function readUriBytes(uri: string): Promise<Uint8Array> {
  const res = await fetch(uri);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

export async function parseImportPayload(
  format: ImportFormat,
  fileUri: string,
  fileName: string,
  now: number,
  zipUri?: string | null,
): Promise<ParsedImportBundle> {
  if (format === 'csv') {
    const csvBytes = await readUriBytes(fileUri);
    const csvText = strFromU8(csvBytes);
    const zipBytes = zipUri ? await readUriBytes(zipUri) : undefined;
    return parseCsvBundle({ csvText, zipBytes });
  }

  const apkgBytes = await readUriBytes(fileUri);
  const pkg = unpackApkg(apkgBytes);
  const { File, Paths } = await import('expo-file-system');
  const tmp = new File(Paths.cache, `anki-col-${now}.anki2`);
  tmp.create({ overwrite: true });
  tmp.write(pkg.collection);
  const db = await openDatabaseAsync(tmp.uri, { enableChangeListener: false });
  try {
    return await parseAnkiCollection(expoSqlAdapter(db), pkg);
  } finally {
    await db.closeAsync();
    tmp.delete();
  }
}

export async function imageUriForParsedCard(
  card: ParsedImportBundle['cards'][number],
  now: number,
  fallbackReadUri: (fileName: string) => Promise<string | null>,
): Promise<string> {
  if (card.imageBytes) return writeImportImageBytes(card.imageBytes, card.imageFile, now);
  const fromZip = await fallbackReadUri(card.imageFile);
  if (fromZip) return fromZip;
  throw new Error(`画像 ${card.imageFile} を読み込めません`);
}
