import Database from 'better-sqlite3';
import { zipSync } from 'fflate';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Builds a minimal .apkg with one Image Occlusion–style note for tests. */
export function buildSampleApkg(): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), 'akasheet-apkg-'));
  const dbPath = join(dir, 'collection.anki2');
  const db = new Database(dbPath);

  db.exec(`
    CREATE TABLE col (id integer primary key, crt int, mod int, scm int, ver int, dty int, usn int, ls int,
      conf text, models text, decks text, dconf text, tags text);
    INSERT INTO col VALUES (1,1600000000,0,0,11,0,0,0,'{}','{}','{"1":{"id":1,"name":"親::子","usn":0,"collapsed":false,"browserCollapsed":false,"desc":0,"dyn":0,"conf":1,"extendNew":0,"extendRev":0}}','{}','{}');
    CREATE TABLE notes (id integer primary key, guid text, mid int, mod int, usn int, tags text, flds text, sfld int, csum int, flags int, data text);
    CREATE TABLE cards (id integer primary key, nid int, did int, ord int, mod int, usn int, type int, queue int, due int, ivl int, factor int, reps int, lapses int, left int, odue int, odid int, flags int, data text);
    CREATE TABLE revlog (id integer primary key, cid int, usn int, ease int, ivl int, lastIvl int, factor int, time int, type int);
  `);

  const flds = [
    'IO',
    '<img src="pic.jpg"/><svg viewBox="0 0 1 1"><rect data-cloze="c1" x="0.2" y="0.3" width="0.4" height="0.1"/></svg>',
    '',
  ].join('\u001f');

  db.prepare(
    'INSERT INTO notes (id,guid,mid,mod,usn,tags,flds,sfld,csum,flags,data) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  ).run(1, 'g', 1, 0, 0, '', flds, 0, 0, 0, '');
  db.prepare(
    'INSERT INTO cards (id,nid,did,ord,mod,usn,type,queue,due,ivl,factor,reps,lapses,left,odue,odid,flags,data) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(42, 1, 1, 0, 0, 0, 2, 2, 10, 3, 2500, 2, 0, 0, 0, 0, 0, '');
  db.prepare(
    'INSERT INTO revlog (id,cid,usn,ease,ivl,lastIvl,factor,time,type) VALUES (?,?,?,?,?,?,?,?,?)',
  ).run(1, 42, 0, 3, 1, 0, 2500, 1_700_000_000_000, 1);

  db.close();
  const col = readFileSync(dbPath);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
  const zip = zipSync({
    'collection.anki2': col,
    media: new TextEncoder().encode(JSON.stringify({ '0': 'pic.jpg' })),
    '0': jpeg,
  });
  rmSync(dir, { recursive: true, force: true });
  return zip;
}
