import {
  applyAnswer,
  currentCard,
  isFinished,
  lastAnswer,
  nextPendingIn,
  resumePending,
  revealAll,
  revealNext,
  sessionStats,
  startSession,
  toggleReveal,
  undoAnswer,
  type QueueItem,
  type SessionState,
} from './session';

const items: QueueItem[] = [
  { cardId: 'n1', phase: 'new', dueAt: 5 },
  { cardId: 'r2', phase: 'review', dueAt: 20 },
  { cardId: 'n2', phase: 'new', dueAt: 6 },
  { cardId: 'r1', phase: 'relearning', dueAt: 10 },
  { cardId: 'n3', phase: 'new', dueAt: 7 },
];

let logSeq = 0;
const answer = (s: SessionState, rating: 1 | 3, againDueAt = 1000) =>
  applyAnswer(s, { cardId: currentCard(s)!, rating, logId: `log${logSeq++}` }, againDueAt);

describe('review session', () => {
  it('orders due reviews first then new cards within the limit', () => {
    expect(startSession(items, 2).queue).toEqual(['r1', 'r2', 'n1', 'n2']);
    expect(startSession(items, -1).queue).toEqual(['r1', 'r2']);
  });

  it('toggles, reveals next in ord order, and reveals all', () => {
    let s = startSession(items, 20);
    s = toggleReveal(s, 'm2');
    let opened: string | null;
    [s, opened] = revealNext(s, ['m1', 'm2', 'm3']);
    expect(opened).toBe('m1');
    expect(s.revealed).toEqual(['m2', 'm1']);
    s = toggleReveal(s, 'm2');
    expect(s.revealed).toEqual(['m1']);
    s = revealAll(s, ['m1', 'm2', 'm3']);
    expect(revealNext(s, ['m1', 'm2', 'm3'])[1]).toBeNull();
  });

  it('requeues まだ at position min(3, len), at most twice, then pends', () => {
    let s = startSession(items, 20); // r1 r2 n1 n2 n3
    s = answer(s, 1);
    expect(s.queue).toEqual(['r2', 'n1', 'n2', 'r1', 'n3']);
    expect(s.revealed).toEqual([]);
    s = answer(s, 3); // r2
    s = answer(s, 3); // n1
    s = answer(s, 3); // n2
    expect(s.queue).toEqual(['r1', 'n3']);
    s = answer(s, 1); // r1 again (2nd)
    expect(s.queue).toEqual(['n3', 'r1']);
    s = answer(s, 3); // n3
    s = answer(s, 1, 5000); // r1 third time → pending
    expect(s.queue).toEqual([]);
    expect(s.pending).toEqual([{ cardId: 'r1', dueAt: 5000 }]);
    expect(isFinished(s)).toBe(true);
    expect(nextPendingIn(s, 4000)).toBe(1000);
    expect(resumePending(s, 4999).queue).toEqual([]);
    const resumed = resumePending(s, 5000);
    expect(resumed.queue).toEqual(['r1']);
    expect(resumed.pending).toEqual([]);
    expect(resumePending(resumed, 9999)).toBe(resumed);
    expect(nextPendingIn(resumed, 0)).toBeNull();
  });

  it('undo restores the exact prior state', () => {
    let s = startSession(items, 20);
    s = toggleReveal(s, 'm1');
    const before = s;
    s = answer(s, 1);
    expect(lastAnswer(s)?.rating).toBe(1);
    s = undoAnswer(s);
    expect(s).toEqual(before);
    expect(undoAnswer(s)).toBe(s);
  });

  it('rejects answers for a different card', () => {
    const s = startSession(items, 20);
    expect(() => applyAnswer(s, { cardId: 'zzz', rating: 3, logId: 'x' }, 0)).toThrow();
    expect(() => applyAnswer(startSession([], 20), { cardId: 'zzz', rating: 3, logId: 'x' }, 0)).toThrow();
  });

  it('counts a card as まだ when it was rated まだ at least once, even if later 覚えた', () => {
    let s = startSession(items, 2); // r1 r2 n1 n2
    s = answer(s, 1); // r1 まだ → r2 n1 n2 r1
    s = answer(s, 3);
    s = answer(s, 1); // n1 まだ → n2 r1 n1
    s = answer(s, 3); // n2
    s = answer(s, 3); // r1 覚えた (still まだ for summary)
    expect(sessionStats(s)).toEqual({ total: 4, remembered: 2, again: ['r1', 'n1'] });
  });

  it('counts each card once when まだ then 覚えた on the same card in one session', () => {
    let s = startSession([{ cardId: 'c1', phase: 'review', dueAt: 0 }], 20);
    s = answer(s, 1);
    s = answer(s, 3);
    expect(sessionStats(s)).toEqual({ total: 1, remembered: 0, again: ['c1'] });
  });
});
