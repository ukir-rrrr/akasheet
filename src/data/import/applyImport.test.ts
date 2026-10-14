import { createHash } from 'node:crypto';

import { zipSync } from 'fflate';

import { sm2b } from '@/domain/scheduler/sm2b';
import { fixedClock } from '@/shared/clock';
import { createIdGenerator } from '@/shared/id';

import { migrate } from '../db/migrate';
import { createBetterSqliteDriver } from '../db/testing/betterSqliteDriver';
import { createMediaStore, type MediaBackend } from '../media/store';
import { fitLongSide } from '../media/types';
import { plaintextFieldProtector } from '../security/fieldProtector';
import { createCardRepo } from '../repos/cardRepo';
import { createFolderRepo } from '../repos/folderRepo';
import { parseCsvZip } from '@/import/csv/parseBundle';

import { applyImportPreview } from './applyImport';

function fakeBackend() {
  const blobs = new Map<string, Uint8Array<ArrayBuffer>>();
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const backend: MediaBackend = {
    async stageImport(bytes: Uint8Array<ArrayBuffer>) {
      const uri = `stage://${blobs.size}`;
      blobs.set(uri, bytes);
      return uri;
    },
    async discardStage(uri) {
      blobs.delete(uri);
    },
    async encodeJpeg(uri, maxSide) {
      const src = blobs.get(uri)!;
      const out = `${uri}@${maxSide}`;
      blobs.set(out, new Uint8Array([...src, maxSide & 0xff]));
      const fit = fitLongSide(100, 100, maxSide) ?? { width: 100, height: 100 };
      return { uri: out, ...fit };
    },
    async readBytes(uri) {
      const b = blobs.get(uri) ?? files.get(uri);
      if (!b) throw new Error('missing');
      return b;
    },
    async sha256(bytes) {
      return createHash('sha256').update(bytes).digest('hex');
    },
    async putIfAbsent(key, srcUri) {
      if (files.has(key)) return false;
      files.set(key, await backend.readBytes(srcUri));
      return true;
    },
    async remove(key) {
      files.delete(key);
    },
    async keys() {
      return [...files.keys()];
    },
    async uriFor(key) {
      return files.has(key) ? `mem://${key}` : null;
    },
  };
  return createMediaStore(backend);
}

describe('applyImportPreview', () => {
  it('creates folders with parent_id and skips duplicate external_id', async () => {
    const db = createBetterSqliteDriver();
    await migrate(db);
    const clock = fixedClock(1_700_000_000_000);
    let seq = 0;
    const ctx = {
      db,
      clock,
      newId: createIdGenerator(clock, (n) => {
        const b = new Uint8Array(n);
        b[15] = seq++ & 0xff;
        b[14] = (seq >> 8) & 0xff;
        return b;
      }),
      deviceId: 'dev',
      timeZone: () => 'UTC',
      scheduler: sm2b,
      fields: plaintextFieldProtector,
    };
    const folders = createFolderRepo(ctx);
    const cards = createCardRepo(ctx);
    const store = fakeBackend();

    const masks = JSON.stringify([{ v: 1, shapes: [{ t: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.1 }] }]);
    const csv = `folder_name,image_file,masks,title\n"A::B",img.jpg,"${masks.replaceAll('"', '""')}",t1\n`;
    const zip = zipSync({
      'd.csv': new TextEncoder().encode(csv),
      'img.jpg': new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    });
    const preview = parseCsvZip(zip, 'z.zip');
    expect(preview.cards).toHaveLength(1);
    const first = await applyImportPreview({ folders, cards, store }, preview);
    expect(first.failed).toBe(0);
    expect(first.created).toBe(1);

    const second = await applyImportPreview({ folders, cards, store }, preview);
    expect(second.skippedDuplicate).toBe(1);

    const child = await db.get<{ parent_id: string | null }>(
      'SELECT parent_id FROM folders WHERE deleted_at IS NULL AND parent_id IS NOT NULL',
    );
    expect(child?.parent_id).toBeTruthy();
  });
});
