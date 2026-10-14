import Database from 'better-sqlite3';

import { parseAnkiCollection } from './parseCollection';
import type { AnkiSql } from './sqlTypes';

function betterSqlAdapter(db: Database.Database): AnkiSql {
  return {
    async get<T>(sql: string, params: readonly unknown[] = []) {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    async all<T>(sql: string, params: readonly unknown[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
  };
}

function makeAnkiDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE col (decks TEXT, crt INTEGER);
    INSERT INTO col VALUES ('{"1":{"name":"教科::単元"}}', 1700000000);
    CREATE TABLE notes (id INTEGER, mid INTEGER, tags TEXT, flds TEXT);
    INSERT INTO notes VALUES (10, 1, 'akasheet:import', '単語\x1f<img src="pic.jpg">\x1frect:0.1,0.1,0.2,0.2\x1f');
    CREATE TABLE cards (id INTEGER, nid INTEGER, did INTEGER, ord INTEGER, ivl INTEGER, factor INTEGER, reps INTEGER, lapses INTEGER, queue INTEGER, due INTEGER, type INTEGER);
    INSERT INTO cards VALUES (100, 10, 1, 0, 0, 2500, 0, 0, 0, 0, 0);
  `);
  return db;
}

describe('parseAnkiCollection', () => {
  it('parses tagged notes with rect masks', async () => {
    const colDb = makeAnkiDb();
    const collection = colDb.serialize();
    colDb.close();

    const sqlDb = new Database(collection);
    const pkg = {
      collection,
      mediaMap: {} as Record<string, string>,
      files: new Map<string, Uint8Array>([['pic.jpg', new Uint8Array([9, 9, 9])]]),
    };
    const bundle = await parseAnkiCollection(betterSqlAdapter(sqlDb), pkg);
    sqlDb.close();
    expect(bundle.cards).toHaveLength(1);
    expect(bundle.cards[0].deckPath).toEqual(['教科', '単元']);
    expect(bundle.cards[0].masks[0].shapes[0].t).toBe('rect');
    expect(bundle.cards[0].imageBytes?.byteLength).toBe(3);
  });
});
