import * as Crypto from 'expo-crypto';
import { openDatabaseAsync } from 'expo-sqlite';

import type { SqlReader } from './ankiCollection';

function tempName(): string {
  return Array.from(Crypto.getRandomBytes(6), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Opens a temporary copy of `collection.anki2` for parsing (read-only use). */
export async function openAnkiCollectionDb(bytes: Uint8Array): Promise<SqlReader> {
  const { File, Paths } = await import('expo-file-system');
  const file = new File(Paths.cache, `anki-import-${tempName()}.anki2`);
  file.create({ overwrite: true });
  file.write(bytes);
  const db = await openDatabaseAsync(file.uri, { useNewConnection: true });
  return {
    async get<T>(sql: string, params?: readonly (string | number | null)[]) {
      return (await db.getFirstAsync<T>(sql, ...(params ?? []))) ?? null;
    },
    async all<T>(sql: string, params?: readonly (string | number | null)[]) {
      return await db.getAllAsync<T>(sql, ...(params ?? []));
    },
  };
}
