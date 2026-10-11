import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { openDatabaseAsync } from 'expo-sqlite';

import { createCardRepo } from '@/data/repos/cardRepo';
import type { RepoContext } from '@/data/repos/context';
import { createFolderRepo } from '@/data/repos/folderRepo';
import { createReviewRepo } from '@/data/repos/reviewRepo';
import { deviceTimeZone, systemClock } from '@/shared/clock';
import { createIdGenerator } from '@/shared/id';

import type { SqlDriver } from './driver';
import { createExpoDriver } from './expoDriver';
import { migrate } from './migrate';

export const DB_NAME = 'mekuru.db';

export type AppData = {
  db: SqlDriver;
  ctx: RepoContext;
  folders: ReturnType<typeof createFolderRepo>;
  cards: ReturnType<typeof createCardRepo>;
  reviews: ReturnType<typeof createReviewRepo>;
};

async function backupDatabase(path: string, fromVersion: number) {
  if (Platform.OS === 'web') return;
  const { File } = await import('expo-file-system');
  const uri = path.startsWith('file:') ? path : `file://${path}`;
  const src = new File(uri);
  if (!src.exists) return;
  const dest = new File(`${uri}.v${fromVersion}.bak`);
  if (dest.exists) dest.delete();
  await src.copy(dest);
}

async function loadDeviceId(db: SqlDriver, newId: () => string): Promise<string> {
  const row = await db.get<{ value: string }>("SELECT value FROM app_meta WHERE key = 'device_id'");
  if (row) return row.value;
  const id = newId();
  await db.run("INSERT INTO app_meta (key, value) VALUES ('device_id', ?)", [id]);
  return id;
}

/** The only place that opens the database (foreign_keys is per-connection). */
export async function openAppData(): Promise<AppData> {
  const raw = await openDatabaseAsync(DB_NAME);
  const pragmas = ['PRAGMA foreign_keys = ON', 'PRAGMA busy_timeout = 5000'];
  if (Platform.OS !== 'web') pragmas.unshift('PRAGMA journal_mode = WAL');
  for (const p of pragmas) await raw.execAsync(p);
  const db = createExpoDriver(raw);
  await migrate(db, { beforeMigrate: (v) => backupDatabase(raw.databasePath, v) });
  const newId = createIdGenerator(systemClock, (n) => Crypto.getRandomBytes(n));
  const ctx: RepoContext = {
    db,
    clock: systemClock,
    newId,
    deviceId: await loadDeviceId(db, newId),
    timeZone: deviceTimeZone,
  };
  return {
    db,
    ctx,
    folders: createFolderRepo(ctx),
    cards: createCardRepo(ctx),
    reviews: createReviewRepo(ctx),
  };
}
