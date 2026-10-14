import type { SqlDriver } from '../db/driver';
import type { MediaBackend } from '../media/store';
import type { MetaRepo } from '../repos/metaRepo';
import { FIELD_PREFIX, isEncryptedBlob, isValidSealedField } from './aead';
import { DATA_PROTECTION_META, DATA_PROTECTION_VERSION } from './migrateAtRest';
import { WEB_WRAP_PREFIX } from './mediaAtRest';

const TEXT_COLUMNS: { table: string; col: string }[] = [
  { table: 'folders', col: 'name' },
  { table: 'cards', col: 'title' },
  { table: 'masks', col: 'geometry' },
];

/** True when local storage already holds ciphertext that requires the device DEK. */
export async function detectProtectedData(deps: {
  db: SqlDriver;
  meta: MetaRepo;
  mediaBackend: MediaBackend;
  platformOs: string;
}): Promise<boolean> {
  if ((await deps.meta.get(DATA_PROTECTION_META)) === DATA_PROTECTION_VERSION) return true;

  for (const { table, col } of TEXT_COLUMNS) {
    const rows = await deps.db.all<{ value: string }>(
      `SELECT ${col} AS value FROM ${table} WHERE ${col} LIKE ?`,
      [`${FIELD_PREFIX}%`],
    );
    for (const r of rows) {
      if (isValidSealedField(r.value)) return true;
    }
  }

  for (const key of await deps.mediaBackend.keys()) {
    const uri = await deps.mediaBackend.uriFor(key);
    if (uri === null) continue;
    if (deps.platformOs === 'web' && uri.startsWith(WEB_WRAP_PREFIX)) return true;
    try {
      const raw = await deps.mediaBackend.readBytes(uri);
      if (isEncryptedBlob(raw)) return true;
    } catch {
      // ignore unreadable entries
    }
  }

  return false;
}
