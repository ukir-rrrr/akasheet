import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { openDatabaseAsync } from 'expo-sqlite';

import { sm2b } from '@/domain/scheduler/sm2b';
import { deviceTimeZone, systemClock, type Clock } from '@/shared/clock';
import { createIdGenerator } from '@/shared/id';

import { mediaStore } from '../media/mediaStore';
import type { MediaStore } from '../media/store';
import { createCardRepo, type CardRepo } from '../repos/cardRepo';
import type { RepoContext } from '../repos/context';
import { createFolderRepo, type FolderRepo } from '../repos/folderRepo';
import { createMediaRepo } from '../repos/mediaRepo';
import { createMetaRepo, type MetaRepo } from '../repos/metaRepo';
import { createReviewRepo, type ReviewRepo } from '../repos/reviewRepo';
import { runMaintenance, saveCard, type SaveCardInput } from '../services';
import { createExpoDriver } from './expoDriver';
import { migrate } from './migrate';

export const DB_NAME = 'akasheet.db';

/** Everything the UI may use. The SQL driver and repo context stay inside the data layer. */
export type AppData = {
  clock: Clock;
  timeZone: () => string;
  folders: FolderRepo;
  cards: CardRepo;
  reviews: ReviewRepo;
  meta: MetaRepo;
  images: Pick<MediaStore, 'prepareImage' | 'resolveMediaUri'>;
  saveCard(input: SaveCardInput): Promise<string>;
  runMaintenance(): Promise<{ purged: number; removedFiles: number }>;
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

/** The only place that opens the database (foreign_keys is per-connection). */
export async function openAppData(): Promise<AppData> {
  const raw = await openDatabaseAsync(DB_NAME);
  const pragmas = ['PRAGMA foreign_keys = ON', 'PRAGMA busy_timeout = 5000'];
  if (Platform.OS !== 'web') pragmas.unshift('PRAGMA journal_mode = WAL');
  for (const p of pragmas) await raw.execAsync(p);
  const db = createExpoDriver(raw);
  await migrate(db, { beforeMigrate: (v) => backupDatabase(raw.databasePath, v) });
  const newId = createIdGenerator(systemClock, (n) => Crypto.getRandomBytes(n));
  const meta = createMetaRepo(db);
  const ctx: RepoContext = {
    db,
    clock: systemClock,
    newId,
    deviceId: await meta.ensureDeviceId(newId),
    timeZone: deviceTimeZone,
    scheduler: sm2b,
  };
  const cards = createCardRepo(ctx);
  const media = createMediaRepo(ctx);
  return {
    clock: ctx.clock,
    timeZone: ctx.timeZone,
    folders: createFolderRepo(ctx),
    cards,
    reviews: createReviewRepo(ctx),
    meta,
    images: mediaStore,
    saveCard: (input) => saveCard({ cards, store: mediaStore }, input),
    runMaintenance: () => runMaintenance({ media, store: mediaStore, clock: ctx.clock }),
  };
}
