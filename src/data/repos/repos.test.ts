import { dayEnd, dayStart } from '@/domain/scheduler/day';
import type { MaskGeometry } from '@/domain/mask/types';
import { fixedClock } from '@/shared/clock';
import { ValidationError } from '@/shared/errors';
import { createIdGenerator } from '@/shared/id';
import { sm2b } from '@/domain/scheduler/sm2b';

import { plaintextFieldProtector } from '../security/fieldProtector';
import { migrate, userVersion } from '../db/migrate';
import { LATEST_VERSION, MIGRATIONS } from '../db/migrations';
import { createBetterSqliteDriver } from '../db/testing/betterSqliteDriver';
import type { NewMedia } from '../media/types';
import { createCardRepo, EMPTY_MASKS_MESSAGE } from './cardRepo';
import type { RepoContext } from './context';
import { createFolderRepo } from './folderRepo';
import { createMediaRepo } from './mediaRepo';
import { createMetaRepo } from './metaRepo';
import { createReviewRepo } from './reviewRepo';

const TZ = 'Asia/Tokyo';
const T0 = Date.parse('2026-10-11T13:00:00+09:00');
const MIN = 60_000;

const stroke: MaskGeometry = { v: 1, shapes: [{ t: 'stroke', w: 0.01, p: [0.1, 0.5, 0.4, 0.5] }] };
const rect: MaskGeometry = { v: 1, shapes: [{ t: 'rect', x: 0.1, y: 0.1, w: 0.3, h: 0.05 }] };

function media(sha = 'a'.repeat(64)): NewMedia {
  return {
    sha256: sha,
    path: `media/${sha.slice(0, 2)}/${sha}.jpg`,
    thumbPath: `thumbs/${sha.slice(0, 2)}/${sha}.jpg`,
    mime: 'image/jpeg',
    width: 1536,
    height: 2048,
    byteSize: 1000,
  };
}

async function setup() {
  const db = createBetterSqliteDriver();
  await migrate(db);
  const clock = fixedClock(T0);
  let seq = 0;
  const ctx: RepoContext = {
    db,
    clock,
    newId: createIdGenerator(clock, (n) => {
      const b = new Uint8Array(n);
      b[15] = seq++ & 0xff;
      b[14] = (seq >> 8) & 0xff;
      return b;
    }),
    deviceId: 'device-1',
    timeZone: () => TZ,
    scheduler: sm2b,
    fields: plaintextFieldProtector,
  };
  return {
    db,
    clock,
    ctx,
    folders: createFolderRepo(ctx),
    cards: createCardRepo(ctx),
    reviews: createReviewRepo(ctx),
    mediaRepo: createMediaRepo(ctx),
    end: () => dayEnd(clock.now(), TZ),
  };
}

describe('migrations', () => {
  it('migrates an empty DB and is a no-op the second time', async () => {
    const db = createBetterSqliteDriver();
    expect(await migrate(db)).toEqual([1]);
    expect(await userVersion(db)).toBe(LATEST_VERSION);
    expect(await migrate(db)).toEqual([]);
  });

  it('upgrades an existing DB, backs it up first, and keeps data', async () => {
    const { db, folders } = await setup();
    await folders.create('日本史');
    const backups: number[] = [];
    const next = [
      ...MIGRATIONS,
      { version: 2, name: 'test', sql: 'ALTER TABLE folders ADD COLUMN icon TEXT;' },
    ];
    expect(await migrate(db, { migrations: next, beforeMigrate: async (v) => void backups.push(v) })).toEqual(
      [2],
    );
    expect(backups).toEqual([1]);
    expect(await userVersion(db)).toBe(2);
    expect((await folders.list(0)).map((f) => f.name)).toEqual(['日本史']);
  });

  it('rolls back a failing migration without bumping user_version', async () => {
    const { db } = await setup();
    const bad = [
      ...MIGRATIONS,
      { version: 2, name: 'bad', sql: 'CREATE TABLE x (a INT); SELECT * FROM nope;' },
    ];
    await expect(migrate(db, { migrations: bad })).rejects.toThrow();
    expect(await userVersion(db)).toBe(1);
    expect(await db.get("SELECT name FROM sqlite_master WHERE name = 'x'")).toBeNull();
  });

  it('enforces ease >= 1.3 with a CHECK constraint', async () => {
    const { db, folders, cards } = await setup();
    const f = await folders.create('x');
    const { cardId } = await cards.create({
      folderId: f.id,
      media: media(),
      masks: [rect],
      source: 'library',
    });
    await expect(db.run('UPDATE review_states SET ease = 1.29 WHERE card_id = ?', [cardId])).rejects.toThrow(
      /CHECK/,
    );
  });

  it('uses the due index for the due query and has no absolute path columns', async () => {
    const { db } = await setup();
    const plan = await db.all<{ detail: string }>(
      'EXPLAIN QUERY PLAN SELECT card_id FROM review_states WHERE due_at < ?',
      [1],
    );
    expect(plan.map((p) => p.detail).join(' ')).toMatch(/idx_review_due/);
    const cols = await db.all<{ name: string }>("SELECT name FROM pragma_table_info('media')");
    expect(cols.map((c) => c.name)).not.toContain('absolute_path');
  });
});

describe('folderRepo', () => {
  it('creates nested folders via ensurePath', async () => {
    const { folders } = await setup();
    const leaf = await folders.ensurePath(['親', '子']);
    const parent = await folders.findChildByName(null, '親');
    expect(parent?.name).toBe('親');
    const child = await folders.findChildByName(parent!.id, '子');
    expect(child?.id).toBe(leaf);
  });

  it('creates, lists with counts, renames and validates names', async () => {
    const { folders, cards, end } = await setup();
    const a = await folders.create('  日本史 ');
    const b = await folders.create('英単語', 'ai');
    expect(a).toMatchObject({ name: '日本史', color: 'tobi' });
    expect(b.color).toBe('ai');
    await cards.create({ folderId: a.id, media: media(), masks: [rect], source: 'library' });
    const list = await folders.list(end());
    expect(list.map((f) => [f.name, f.cardCount, f.dueCount])).toEqual([
      ['日本史', 1, 1],
      ['英単語', 0, 0],
    ]);
    await folders.rename(b.id, '英語');
    expect((await folders.get(b.id))?.name).toBe('英語');
    await expect(folders.create('   ')).rejects.toBeInstanceOf(ValidationError);
    await expect(folders.create('あ'.repeat(41))).rejects.toThrow(/40文字/);
    await expect(folders.rename('missing', 'x')).rejects.toBeInstanceOf(ValidationError);
  });

  it('soft-deletes a folder with its cards; logs remain', async () => {
    const { db, folders, cards, reviews, end } = await setup();
    const f = await folders.create('日本史');
    const { cardId } = await cards.create({
      folderId: f.id,
      media: media(),
      masks: [rect],
      source: 'library',
    });
    await reviews.answer({ cardId, rating: 3, revealedCount: 1, maskCount: 1, durationMs: 1000 });
    await folders.remove(f.id);
    expect(await folders.list(end())).toEqual([]);
    expect(await folders.get(f.id)).toBeNull();
    expect(await cards.get(cardId)).toBeNull();
    expect(await reviews.queue(null, Infinity)).toEqual([]);
    expect((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM review_logs'))?.n).toBe(1);
    expect((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM masks WHERE deleted_at IS NULL'))?.n).toBe(
      0,
    );
  });
});

describe('cardRepo', () => {
  it('saves media+card+masks+state with reading-order ords and reuses media by sha', async () => {
    const { folders, cards, reviews } = await setup();
    const f = await folders.create('日本史');
    const first = await cards.create({
      folderId: f.id,
      media: media(),
      masks: [stroke, rect],
      source: 'camera',
      title: 'p.48',
    });
    const detail = await cards.get(first.cardId);
    expect(detail?.masks.map((m) => m.geometry.shapes[0].t)).toEqual(['rect', 'stroke']);
    expect(detail?.masks.map((m) => m.ord)).toEqual([0, 1]);
    expect(detail?.media).toMatchObject({ width: 1536, height: 2048 });
    expect((await reviews.state(first.cardId)).phase).toBe('new');
    const second = await cards.create({ folderId: f.id, media: media(), masks: [rect], source: 'library' });
    expect(second.reusedMedia).toBe(true);
    expect(second.mediaId).toBe(first.mediaId);
    const list = await cards.listByFolder(f.id);
    expect(list).toHaveLength(2);
    const listed = list.find((c) => c.id === first.cardId);
    expect(listed?.masks).toHaveLength(2);
    expect(listed?.masks[0]).toEqual(expect.objectContaining({ geometry: expect.any(Object) }));
    expect(listed?.media).toEqual({
      thumbPath: expect.any(String),
      width: 1536,
      height: 2048,
    });
    expect(listed).not.toHaveProperty('lastReviewedAt');
  });

  it('stores external_id and imported review algorithm', async () => {
    const { folders, cards, reviews, db } = await setup();
    const f = await folders.create('import');
    const due = T0 + 86_400_000;
    const { cardId } = await cards.create({
      folderId: f.id,
      media: media('b'.repeat(64)),
      masks: [rect],
      source: 'import:csv',
      externalId: 'csv-1',
      review: {
        phase: 'review',
        dueAt: due,
        intervalDays: 3,
        ease: 2.5,
        reps: 2,
        lapses: 0,
        lastReviewedAt: T0,
      },
    });
    expect(await cards.findByExternal('import:csv', 'csv-1')).toEqual({ id: cardId });
    const row = await db.get<{ algorithm: string; due_at: number }>(
      'SELECT algorithm, due_at FROM review_states WHERE card_id = ?',
      [cardId],
    );
    expect(row?.algorithm).toBe('imported');
    expect(row?.due_at).toBe(due);
    expect((await reviews.state(cardId)).phase).toBe('review');
  });

  it('rejects zero masks, absolute paths and missing folders', async () => {
    const { folders, cards } = await setup();
    const f = await folders.create('x');
    await expect(
      cards.create({ folderId: f.id, media: media(), masks: [], source: 'library' }),
    ).rejects.toThrow(EMPTY_MASKS_MESSAGE);
    await expect(
      cards.create({
        folderId: f.id,
        media: { ...media(), path: '/var/mobile/a.jpg' },
        masks: [rect],
        source: 'library',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      cards.create({
        folderId: f.id,
        media: { ...media(), path: 'file:///a.jpg' },
        masks: [rect],
        source: 'library',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      cards.create({ folderId: 'nope', media: media(), masks: [rect], source: 'library' }),
    ).rejects.toThrow(/フォルダ/);
    const bad = { v: 1, shapes: [{ t: 'rect', x: 2, y: 0, w: 1, h: 1 }] } as unknown as MaskGeometry;
    await expect(
      cards.create({ folderId: f.id, media: media(), masks: [bad], source: 'library' }),
    ).rejects.toThrow();
  });

  it('leaves nothing behind when the save transaction fails midway', async () => {
    const { db, ctx, folders } = await setup();
    const f = await folders.create('x');
    let calls = 0;
    const failing = createCardRepo({
      ...ctx,
      newId: () => {
        if (++calls === 3) throw new Error('disk full');
        return ctx.newId();
      },
    });
    await expect(
      failing.create({
        folderId: f.id,
        media: media('b'.repeat(64)),
        masks: [rect, stroke],
        source: 'library',
      }),
    ).rejects.toThrow('disk full');
    for (const table of ['media', 'cards', 'masks', 'review_states']) {
      expect((await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n).toBe(0);
    }
  });

  it('skips masks with invalid stored geometry but still opens the card', async () => {
    const { db, folders, cards } = await setup();
    const f = await folders.create('x');
    const { cardId } = await cards.create({
      folderId: f.id,
      media: media(),
      masks: [rect, stroke],
      source: 'library',
    });
    await db.run('UPDATE masks SET geometry = \'{"v":9}\' WHERE card_id = ? AND ord = 0', [cardId]);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const detail = await cards.get(cardId);
    expect(detail?.masks).toHaveLength(1);
    expect(detail?.invalidMaskCount).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('listByFolder skips invalid mask geometry like get()', async () => {
    const { db, folders, cards } = await setup();
    const f = await folders.create('x');
    const { cardId } = await cards.create({
      folderId: f.id,
      media: media(),
      masks: [rect, stroke],
      source: 'library',
    });
    await db.run('UPDATE masks SET geometry = \'{"v":9}\' WHERE card_id = ? AND ord = 0', [cardId]);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const list = await cards.listByFolder(f.id);
    expect(list.find((c) => c.id === cardId)?.masks).toHaveLength(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('moves and deletes cards', async () => {
    const { folders, cards, end } = await setup();
    const a = await folders.create('a');
    const b = await folders.create('b');
    const { cardId } = await cards.create({
      folderId: a.id,
      media: media(),
      masks: [rect],
      source: 'library',
    });
    const other = await cards.create({
      folderId: a.id,
      media: media('c'.repeat(64)),
      masks: [rect],
      source: 'library',
    });
    await cards.move([cardId, other.cardId], b.id);
    expect((await folders.list(end())).map((f) => f.cardCount)).toEqual([0, 2]);
    await expect(cards.move([cardId], 'nope')).rejects.toBeInstanceOf(ValidationError);
    await cards.remove([cardId, other.cardId]);
    expect(await cards.listByFolder(b.id)).toEqual([]);
  });
});

describe('mediaRepo', () => {
  it('purges media only after its cards have been deleted for the grace period', async () => {
    const { folders, cards, clock, mediaRepo } = await setup();
    const f = await folders.create('a');
    const kept = await cards.create({ folderId: f.id, media: media(), masks: [rect], source: 'library' });
    const gone = await cards.create({
      folderId: f.id,
      media: media('d'.repeat(64)),
      masks: [rect],
      source: 'library',
    });
    await cards.remove([gone.cardId]);
    const grace = 30 * 86_400_000;
    expect(await mediaRepo.purgeUnreferenced(clock.now() - grace)).toBe(0);
    expect((await mediaRepo.livePaths()).size).toBe(4);
    clock.advance(grace + 1);
    expect(await mediaRepo.purgeUnreferenced(clock.now() - grace)).toBe(1);
    const live = await mediaRepo.livePaths();
    expect(live.size).toBe(2);
    expect(live.has(media().path)).toBe(true);
    expect(kept.mediaId).not.toBe(gone.mediaId);
  });

  it('revives a purged media row when the same image is saved again', async () => {
    const { folders, cards, clock, mediaRepo } = await setup();
    const f = await folders.create('a');
    const first = await cards.create({ folderId: f.id, media: media(), masks: [rect], source: 'library' });
    await cards.remove([first.cardId]);
    clock.advance(1);
    await mediaRepo.purgeUnreferenced(clock.now());
    expect((await mediaRepo.livePaths()).size).toBe(0);
    const again = await cards.create({ folderId: f.id, media: media(), masks: [rect], source: 'library' });
    expect(again).toMatchObject({ mediaId: first.mediaId, reusedMedia: true });
    expect((await mediaRepo.livePaths()).size).toBe(2);
  });
});

describe('metaRepo', () => {
  it('keeps a stable device id and caps counters', async () => {
    const { db } = await setup();
    const meta = createMetaRepo(db);
    let n = 0;
    const id = await meta.ensureDeviceId(() => `id-${++n}`);
    expect(await meta.ensureDeviceId(() => `id-${++n}`)).toBe(id);
    expect([
      await meta.bumpCounter('hint', 2),
      await meta.bumpCounter('hint', 2),
      await meta.bumpCounter('hint', 2),
    ]).toEqual([true, true, false]);
    expect(await meta.get('hint')).toBe('2');
  });
});

describe('reviewRepo', () => {
  it('builds the queue (reviews before new) and filters by folder', async () => {
    const { folders, cards, reviews, clock, end } = await setup();
    const a = await folders.create('a');
    const b = await folders.create('b');
    const c1 = await cards.create({
      folderId: a.id,
      media: media('1'.repeat(64)),
      masks: [rect],
      source: 'library',
    });
    clock.advance(MIN);
    const c2 = await cards.create({
      folderId: b.id,
      media: media('2'.repeat(64)),
      masks: [rect],
      source: 'library',
    });
    await reviews.answer({ cardId: c2.cardId, rating: 1, revealedCount: 0, maskCount: 1, durationMs: null });
    const q = await reviews.queue(null, end());
    expect(q.map((i) => i.cardId)).toEqual([c2.cardId, c1.cardId]);
    expect((await reviews.queue(a.id, end())).map((i) => i.cardId)).toEqual([c1.cardId]);
    expect(await reviews.newIntroducedSince(dayStart(clock.now(), TZ))).toBe(1);
  });

  it('queues explicit card ids regardless of due date, skipping deleted cards', async () => {
    const { folders, cards, reviews } = await setup();
    const f = await folders.create('a');
    const c1 = await cards.create({ folderId: f.id, media: media(), masks: [rect], source: 'library' });
    const c2 = await cards.create({ folderId: f.id, media: media(), masks: [rect], source: 'library' });
    await reviews.answer({ cardId: c1.cardId, rating: 3, revealedCount: 1, maskCount: 1, durationMs: null });
    await cards.remove([c2.cardId]);
    expect(await reviews.queueFor([])).toEqual([]);
    expect((await reviews.queueFor([c1.cardId, c2.cardId])).map((i) => i.cardId)).toEqual([c1.cardId]);
  });

  it('answers atomically and undo restores the previous state', async () => {
    const { db, folders, cards, reviews, clock } = await setup();
    const f = await folders.create('a');
    const { cardId } = await cards.create({
      folderId: f.id,
      media: media(),
      masks: [rect],
      source: 'library',
    });
    const before = await reviews.state(cardId);
    const preview = await reviews.preview(cardId);
    expect(preview[3].intervalDays).toBe(1);
    expect(preview[1].dueAt).toBe(clock.now() + 10 * MIN);
    const res = await reviews.answer({ cardId, rating: 3, revealedCount: 1, maskCount: 1, durationMs: 1200 });
    expect(res.next).toMatchObject({
      phase: 'review',
      intervalDays: 1,
      dueAt: Date.parse('2026-10-12T04:00:00+09:00'),
    });
    expect(await reviews.state(cardId)).toEqual(res.next);
    clock.advance(1000);
    await reviews.undo(res.logId);
    expect(await reviews.state(cardId)).toEqual(before);
    await expect(reviews.undo(res.logId)).rejects.toBeInstanceOf(ValidationError);
    const log = await db.get<{ undone_at: number }>('SELECT undone_at FROM review_logs WHERE id = ?', [
      res.logId,
    ]);
    expect(log?.undone_at).toBe(clock.now());
  });

  it('only allows undoing the latest answer for a card', async () => {
    const { folders, cards, reviews, clock } = await setup();
    const f = await folders.create('a');
    const { cardId } = await cards.create({
      folderId: f.id,
      media: media(),
      masks: [rect],
      source: 'library',
    });
    const first = await reviews.answer({
      cardId,
      rating: 1,
      revealedCount: 0,
      maskCount: 1,
      durationMs: null,
    });
    clock.advance(10 * MIN);
    const second = await reviews.answer({
      cardId,
      rating: 3,
      revealedCount: 1,
      maskCount: 1,
      durationMs: null,
    });
    await expect(reviews.undo(first.logId)).rejects.toThrow(/最新/);
    await reviews.undo(second.logId);
    expect((await reviews.state(cardId)).lastReviewedAt).toBe(T0);
  });

  it('rolls back the log insert when the state update fails', async () => {
    const { db, folders, cards, reviews } = await setup();
    const f = await folders.create('a');
    const { cardId } = await cards.create({
      folderId: f.id,
      media: media(),
      masks: [rect],
      source: 'library',
    });
    await db.exec(
      `CREATE TRIGGER boom BEFORE UPDATE ON review_states BEGIN SELECT RAISE(ABORT, 'boom'); END;`,
    );
    await expect(
      reviews.answer({ cardId, rating: 3, revealedCount: 1, maskCount: 1, durationMs: null }),
    ).rejects.toThrow('boom');
    expect((await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM review_logs'))?.n).toBe(0);
  });

  it('replaying the log reproduces review_states (with fuzz and undo)', async () => {
    const { folders, cards, reviews, clock } = await setup();
    const f = await folders.create('a');
    const { cardId } = await cards.create({
      folderId: f.id,
      media: media(),
      masks: [rect],
      source: 'library',
    });
    const ratings: (1 | 3)[] = [3, 3, 3, 3, 1, 3, 3, 1, 1, 3];
    for (const [i, r] of ratings.entries()) {
      const s = await reviews.state(cardId);
      clock.set(Math.max(clock.now() + MIN, s.dueAt + 9 * 3_600_000));
      const res = await reviews.answer({
        cardId,
        rating: r,
        revealedCount: 1,
        maskCount: 1,
        durationMs: null,
      });
      if (i === 6) {
        clock.advance(1000);
        await reviews.undo(res.logId);
      }
    }
    expect(await reviews.replay(cardId)).toEqual(await reviews.state(cardId));
    await expect(reviews.replay('missing')).rejects.toBeInstanceOf(ValidationError);
    await expect(reviews.state('missing')).rejects.toBeInstanceOf(ValidationError);
  });

  it('reports the next due time after today', async () => {
    const { folders, cards, reviews, end } = await setup();
    const f = await folders.create('a');
    const { cardId } = await cards.create({
      folderId: f.id,
      media: media(),
      masks: [rect],
      source: 'library',
    });
    await reviews.answer({ cardId, rating: 3, revealedCount: 1, maskCount: 1, durationMs: null });
    expect(await reviews.nextDueFrom(null, end())).toBe(Date.parse('2026-10-12T04:00:00+09:00'));
    expect(await reviews.nextDueFrom(f.id, end() + 1)).toBeNull();
  });
});
