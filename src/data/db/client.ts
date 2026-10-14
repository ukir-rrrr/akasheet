import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import { openDatabaseAsync } from 'expo-sqlite';

import { sm2b } from '@/domain/scheduler/sm2b';
import { deviceTimeZone, systemClock, type Clock } from '@/shared/clock';
import { DataProtectionError } from '@/shared/errors';
import { createIdGenerator } from '@/shared/id';

import { platformBackend } from '../media/backend';
import { createMediaStore, type MediaStore } from '../media/store';
import { createCardRepo, type CardRepo } from '../repos/cardRepo';
import type { RepoContext } from '../repos/context';
import { createFolderRepo, type FolderRepo } from '../repos/folderRepo';
import { createMediaRepo } from '../repos/mediaRepo';
import { createMetaRepo, type MetaRepo } from '../repos/metaRepo';
import { createReviewRepo, type ReviewRepo } from '../repos/reviewRepo';
import { defaultDekDeps } from '../security/dek.defaults';
import { loadOrCreateDataKey } from '../security/dek';
import { createEncryptedMediaBackend } from '../security/encryptedMediaBackend';
import { createReadOnlyMediaBackend } from '../security/readOnlyMediaBackend';
import { createFieldProtector, readOnlyFieldProtector } from '../security/fieldProtector';
import { migrateAtRest } from '../security/migrateAtRest';
import { detectProtectedData } from '../security/protectedData';
import { canMutateLocalData, type DataProtection } from '../security/protection';
import {
  guardCardsWhenReadOnly,
  guardFoldersWhenReadOnly,
  guardReviewsWhenReadOnly,
} from '../security/readOnlyGuard';
import { executeImportPlan, type ImportDeps } from '../importService';
import type { ImportPlan, ParsedImportCard } from '@/import/types';
import { runMaintenance, saveCard, type SaveCardInput } from '../services';
import { createExpoDriver } from './expoDriver';
import { migrate } from './migrate';

export const DB_NAME = 'akasheet.db';

/** Everything the UI may use. The SQL driver and repo context stay inside the data layer. */
export type AppData = {
  clock: Clock;
  timeZone: () => string;
  protection: DataProtection;
  folders: FolderRepo;
  cards: CardRepo;
  reviews: ReviewRepo;
  meta: MetaRepo;
  images: Pick<MediaStore, 'prepareImage' | 'resolveMediaUri'>;
  saveCard(input: SaveCardInput): Promise<string>;
  runImport(
    plan: ImportPlan,
    source: 'import:anki' | 'import:csv',
    resolveImageUri: (card: ParsedImportCard) => Promise<string>,
  ): Promise<{ imported: number; skipped: number }>;
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
  if (Platform.OS !== 'web') {
    pragmas.unshift('PRAGMA journal_mode = WAL', 'PRAGMA secure_delete = ON');
  }
  for (const p of pragmas) await raw.execAsync(p);
  const db = createExpoDriver(raw);
  await migrate(db, { beforeMigrate: (v) => backupDatabase(raw.databasePath, v) });

  const meta = createMetaRepo(db);
  const dekResult = await loadOrCreateDataKey({
    ...defaultDekDeps,
    randomBytes: (n) => Crypto.getRandomBytes(n),
    hasProtectedData: () =>
      detectProtectedData({ db, meta, mediaBackend: platformBackend, platformOs: Platform.OS }),
  });
  const protection: DataProtection = dekResult.ok
    ? { mode: 'full', storage: dekResult.storage }
    : { mode: 'read-only', storage: null };

  const fields = dekResult.ok ? createFieldProtector(dekResult.key) : readOnlyFieldProtector;
  const mediaBackend = dekResult.ok
    ? createEncryptedMediaBackend(platformBackend, dekResult.key)
    : createReadOnlyMediaBackend(platformBackend);
  const store = createMediaStore(mediaBackend);

  const newId = createIdGenerator(systemClock, (n) => Crypto.getRandomBytes(n));
  const ctx: RepoContext = {
    db,
    clock: systemClock,
    newId,
    deviceId: await meta.ensureDeviceId(newId),
    timeZone: deviceTimeZone,
    scheduler: sm2b,
    fields,
  };

  if (dekResult.ok) {
    try {
      await migrateAtRest({
        db,
        meta,
        mediaBackend: platformBackend,
        dek: dekResult.key,
        fields,
        platformOs: Platform.OS,
      });
    } catch {
      // Do not block startup; legacy plaintext may remain until the next launch.
    }
  }

  const mutate = canMutateLocalData(protection);
  const cards = guardCardsWhenReadOnly(createCardRepo(ctx), mutate);
  const media = createMediaRepo(ctx);
  const folders = guardFoldersWhenReadOnly(createFolderRepo(ctx), mutate);
  const reviews = guardReviewsWhenReadOnly(createReviewRepo(ctx), mutate);

  return {
    clock: ctx.clock,
    timeZone: ctx.timeZone,
    protection,
    folders,
    cards,
    reviews,
    meta,
    images: store,
    saveCard: (input) => {
      if (!mutate) {
        throw new DataProtectionError(
          'この端末ではデータ保護キーを利用できないため、新しいカードや変更を保存できません。',
        );
      }
      return saveCard({ cards, store }, input);
    },
    runImport: (plan, source, resolveImageUri) => {
      if (!mutate) {
        throw new DataProtectionError(
          'この端末ではデータ保護キーを利用できないため、取り込みを実行できません。',
        );
      }
      const deps: ImportDeps = {
        cards,
        folders,
        store,
        prepareImageFromBytes: async (bytes, _mime) => {
          const { writeImportImageBytes } = await import('../importMedia');
          const uri = await writeImportImageBytes(bytes, 'inline.jpg', ctx.clock.now());
          return store.prepareImage(uri);
        },
      };
      return executeImportPlan(deps, plan, source, resolveImageUri);
    },
    runMaintenance: () => {
      if (!mutate) return Promise.resolve({ purged: 0, removedFiles: 0 });
      return runMaintenance({ media, store, clock: ctx.clock });
    },
  };
}
