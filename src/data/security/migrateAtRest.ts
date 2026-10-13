import { isSealedField } from './aead';
import { encryptMediaFileInPlace } from './mediaAtRest';
import type { FieldProtector } from './fieldProtector';
import type { SqlDriver } from '../db/driver';
import type { MediaBackend } from '../media/store';
import type { MetaRepo } from '../repos/metaRepo';

export const DATA_PROTECTION_META = 'data_protection_v';
export const DATA_PROTECTION_VERSION = '1';

export type AtRestMigrationResult = {
  mediaEncrypted: number;
  fieldsEncrypted: boolean;
};

async function sealColumn(
  db: SqlDriver,
  table: 'folders' | 'cards' | 'masks',
  idCol: string,
  textCol: string,
  fields: FieldProtector,
): Promise<number> {
  const rows = await db.all<{ id: string; value: string }>(
    `SELECT ${idCol} AS id, ${textCol} AS value FROM ${table} WHERE ${textCol} IS NOT NULL`,
  );
  let n = 0;
  for (const r of rows) {
    if (isSealedField(r.value)) continue;
    const sealed = await fields.seal(r.value);
    await db.run(`UPDATE ${table} SET ${textCol} = ? WHERE ${idCol} = ?`, [sealed, r.id]);
    n++;
  }
  return n;
}

/**
 * One-shot upgrade from legacy plaintext storage. Failures leave existing rows/files untouched.
 * Call only when a DEK is available (`full` protection mode).
 */
export async function migrateAtRest(deps: {
  db: SqlDriver;
  meta: MetaRepo;
  mediaBackend: MediaBackend;
  dek: CryptoKey;
  fields: FieldProtector;
  platformOs: string;
}): Promise<AtRestMigrationResult> {
  const platformOs = deps.platformOs;
  if ((await deps.meta.get(DATA_PROTECTION_META)) === DATA_PROTECTION_VERSION) {
    return { mediaEncrypted: 0, fieldsEncrypted: false };
  }

  let mediaEncrypted = 0;
  for (const key of await deps.mediaBackend.keys()) {
    try {
      if (await encryptMediaFileInPlace(deps.mediaBackend, deps.dek, key, platformOs)) mediaEncrypted++;
    } catch {
      // Keep going; do not delete or truncate on partial failure.
    }
  }

  let fieldCount = 0;
  fieldCount += await sealColumn(deps.db, 'folders', 'id', 'name', deps.fields);
  fieldCount += await sealColumn(deps.db, 'cards', 'id', 'title', deps.fields);
  fieldCount += await sealColumn(deps.db, 'masks', 'id', 'geometry', deps.fields);

  await deps.meta.set(DATA_PROTECTION_META, DATA_PROTECTION_VERSION);

  return { mediaEncrypted, fieldsEncrypted: fieldCount > 0 };
}
