import Database from 'better-sqlite3';
import { strToU8, zipSync } from 'fflate';

import type { SqlReader } from './ankiCollection';
import { parseApkgBytes, parseCsvZipBytes } from './apkg';

function openDb(bytes: Uint8Array): SqlReader {
  const db = new Database(Buffer.from(bytes));
  return {
    async get<T>(sql: string, params?: readonly unknown[]) {
      return (db.prepare(sql).get(...(params ?? [])) as T) ?? null;
    },
    async all<T>(sql: string, params?: readonly unknown[]) {
      return db.prepare(sql).all(...(params ?? [])) as T[];
    },
  };
}

function buildMinimalApkg(): Uint8Array {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE col (id integer primary key, crt integer, mod integer, scm integer, ver integer, dty integer, usn integer, ls integer, conf text, models text, decks text, dconf text, tags text);
    INSERT INTO col VALUES (1, 1700000000, 0, 0, 11, 0, 0, 0, '{}', '{}', '{"1":{"id":1,"name":"歴史::江戸"}}', '{}', '');
    CREATE TABLE notes (id integer primary key, guid text, mid integer, mod integer, usn integer, tags text, flds text, sfld integer, csum integer, flags integer, data text);
    INSERT INTO notes VALUES (1, 'g', 1, 0, 0, '', '{{c1::image-occlusion:rect:left=10:top=10:width=20:height=20}}<img src="0" />', 0, 0, 0, '');
    CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer, mod integer, usn integer, type integer, queue integer, due integer, ivl integer, factor integer, reps integer, lapses integer, left integer, odue integer, odid integer, flags integer, data text);
    INSERT INTO cards VALUES (10, 1, 1, 0, 0, 0, 0, 2, 5, 3, 2500, 2, 0, 0, 0, 0, 0, '');
  `);
  const dbBytes = sqlite.serialize();
  sqlite.close();
  const tinyJpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0xff, 0xd9]);
  return zipSync({
    'collection.anki2': dbBytes,
    media: strToU8('{"0":"pic.jpg"}'),
    '0': tinyJpeg,
  });
}

describe('parseApkgBytes', () => {
  it('extracts IO cards with deck path and review snapshot', async () => {
    const bundle = await parseApkgBytes(buildMinimalApkg(), async (b) => openDb(b), 'test.apkg');
    expect(bundle.source).toBe('import:anki');
    expect(bundle.cards).toHaveLength(1);
    expect(bundle.cards[0].folderPath).toBe('歴史::江戸');
    expect(bundle.cards[0].masks).toHaveLength(1);
    expect(bundle.cards[0].review?.reps).toBe(2);
  });
});

describe('parseCsvZipBytes', () => {
  it('reads csv and bundled images', () => {
    const csv =
      'folder_name,image_file,masks,title\n数学,img/a.jpg,"{{c1::image-occlusion:rect:left=10:top=10:width=20:height=20}}",p1\n';
    const bytes = zipSync({
      'cards.csv': strToU8(csv),
      'img/a.jpg': Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]),
    });
    const bundle = parseCsvZipBytes(bytes, 'pack.zip');
    expect(bundle.cards).toHaveLength(1);
    expect(bundle.cards[0].folderPath).toBe('数学');
    expect(bundle.cards[0].title).toBe('p1');
  });
});
