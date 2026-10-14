import type { SqlDriver } from '../db/driver';
import type { MediaBackend } from '../media/store';
import { assertSafeMediaKey } from '../media/types';
import type { MetaRepo } from '../repos/metaRepo';
import { isPlainJpeg, isValidSealedField } from './aead';
import type { FieldProtector } from './fieldProtector';
import { encryptMediaFileInPlace, storedBytesForKey } from './mediaAtRest';

export const DATA_PROTECTION_META = 'data_protection_v';
export const DATA_PROTECTION_VERSION = '1';

export type AtRestMigrationResult = {
  mediaEncrypted: number;
  fieldsEncrypted: boolean;
  completed: boolean;
};

async function sealColumn(
  db: SqlDriver,
  table: 'folders' | 'cards' | 'masks',
  idCol: string,
  textCol: string,
  fields: FieldProtector,
): Promise<{ sealed: number; ok: boolean }> {
  const rows = await db.all<{ id: string; value: string }>(
    `SELECT ${idCol} AS id, ${textCol} AS value FROM ${table} WHERE ${textCol} IS NOT NULL`,
  );
  let sealed = 0;
  for (const r of rows) {
    if (isValidSealedField(r.value)) continue;
    try {
      const next = await fields.seal(r.value);
      await db.run(`UPDATE ${table} SET ${textCol} = ? WHERE ${idCol} = ?`, [next, r.id]);
      sealed++;
    } catch {
      return { sealed, ok: false };
    }
  }
  return { sealed, ok: true };
}

/** Best-effort; returns false on failure so migration can retry without marking complete. */
async function tryWalCheckpointTruncate(db: SqlDriver): Promise<boolean> {
  try {
    await db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    return true;
  } catch {
    return false;
  }
}

/** Clears free-list plaintext after in-place UPDATEs; failures are non-destructive. */
async function tryFinalizeAtRestDb(db: SqlDriver): Promise<boolean> {
  try {
    await db.exec('PRAGMA secure_delete = ON');
    await db.exec('VACUUM');
    return true;
  } catch {
    return false;
  }
}

async function hasRemainingPlainMedia(backend: MediaBackend, platformOs: string): Promise<boolean> {
  for (const key of await backend.keys()) {
    try {
      assertSafeMediaKey(key);
    } catch {
      continue;
    }
    try {
      const raw = await storedBytesForKey(backend, key, platformOs);
      if (raw !== null && isPlainJpeg(raw)) return true;
    } catch {
      return true;
    }
  }
  return false;
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
    return { mediaEncrypted: 0, fieldsEncrypted: false, completed: true };
  }

  let mediaEncrypted = 0;
  let mediaOk = true;
  for (const key of await deps.mediaBackend.keys()) {
    try {
      assertSafeMediaKey(key);
    } catch {
      continue;
    }
    try {
      if (await encryptMediaFileInPlace(deps.mediaBackend, deps.dek, key, platformOs)) mediaEncrypted++;
    } catch {
      mediaOk = false;
    }
  }
  if (await hasRemainingPlainMedia(deps.mediaBackend, platformOs)) mediaOk = false;

  let fieldCount = 0;
  let fieldsOk = true;
  for (const spec of [
    ['folders', 'id', 'name'] as const,
    ['cards', 'id', 'title'] as const,
    ['masks', 'id', 'geometry'] as const,
  ]) {
    const res = await sealColumn(deps.db, spec[0], spec[1], spec[2], deps.fields);
    fieldCount += res.sealed;
    if (!res.ok) fieldsOk = false;
  }

  let walOk = true;
  if (fieldsOk) walOk = await tryWalCheckpointTruncate(deps.db);

  let completed = false;
  if (mediaOk && fieldsOk && walOk) {
    if (await tryFinalizeAtRestDb(deps.db)) {
      await deps.meta.set(DATA_PROTECTION_META, DATA_PROTECTION_VERSION);
      completed = true;
    }
  }

  return { mediaEncrypted, fieldsEncrypted: fieldCount > 0, completed };
}
