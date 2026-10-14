import { createHash } from 'node:crypto';

import type { MaskGeometry } from '@/domain/mask/types';
import { sm2b } from '@/domain/scheduler/sm2b';
import { fixedClock } from '@/shared/clock';
import { createIdGenerator } from '@/shared/id';

import { commitImportBundle } from './importCards';
import { migrate } from './db/migrate';
import { createBetterSqliteDriver } from './db/testing/betterSqliteDriver';
import { createMediaStore, type MediaBackend } from './media/store';
import { fitLongSide } from './media/types';
import { plaintextFieldProtector } from './security/fieldProtector';
import { createCardRepo } from './repos/cardRepo';
import { createFolderRepo } from './repos/folderRepo';

jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => new Uint8Array(n).fill(7),
}));

jest.mock('expo-file-system', () => {
  const blobs = new Map<string, Uint8Array>();
  class File {
    uri: string;
    constructor(_dir: unknown, name: string) {
      this.uri = `file:///cache/${name}`;
    }
    create() {
      return undefined;
    }
    write(data: Uint8Array) {
      blobs.set(this.uri, data);
    }
    async bytes() {
      return blobs.get(this.uri) ?? new Uint8Array();
    }
  }
  return { File, Paths: { cache: '/cache' } };
});

const rect: MaskGeometry = { v: 1, shapes: [{ t: 'rect', x: 0.1, y: 0.1, w: 0.2, h: 0.1 }] };

function fakeBackend() {
  const blobs = new Map<string, Uint8Array>();
  const files = new Map<string, Uint8Array>();
  const backend: MediaBackend = {
    async encodeJpeg(uri, maxSide) {
      const src = blobs.get(uri) ?? new TextEncoder().encode('jpeg');
      blobs.set(uri, src);
      const out = `${uri}@${maxSide}`;
      blobs.set(out, src);
      const fit = fitLongSide(800, 600, maxSide) ?? { width: 800, height: 600 };
      return { uri: out, ...fit };
    },
    async readBytes(uri) {
      const b = blobs.get(uri) ?? new TextEncoder().encode('jpeg');
      return new Uint8Array(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
      ) as Uint8Array<ArrayBuffer>;
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
  return {
    backend,
    seed(uri: string, data: Uint8Array) {
      blobs.set(uri, data);
    },
  };
}

describe('commitImportBundle', () => {
  it('creates cards and nested folders from parsed import', async () => {
    const db = createBetterSqliteDriver();
    await migrate(db);
    const clock = fixedClock(Date.parse('2026-10-11T13:00:00+09:00'));
    let seq = 0;
    const ctx = {
      db,
      clock,
      newId: createIdGenerator(clock, (n) => {
        const b = new Uint8Array(n);
        b[15] = seq++ & 0xff;
        return b;
      }),
      deviceId: 'd',
      timeZone: () => 'Asia/Tokyo',
      scheduler: sm2b,
      fields: plaintextFieldProtector,
    };
    const folders = createFolderRepo(ctx);
    const cards = createCardRepo(ctx);
    const { backend } = fakeBackend();
    const store = createMediaStore(backend);
    const result = await commitImportBundle(
      { cards, folders, store },
      {
        source: 'import:csv',
        label: 't.csv',
        cards: [
          {
            externalId: 'csv:1',
            folderPath: '親::子',
            title: 't',
            imageBytes: new TextEncoder().encode('img'),
            imageMime: 'image/jpeg',
            masks: [rect],
          },
        ],
      },
    );
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(0);
    const list = await folders.list(clock.now());
    expect(list.some((f) => f.name === '親')).toBe(true);
    expect(list.some((f) => f.name === '子')).toBe(true);
  });
});
