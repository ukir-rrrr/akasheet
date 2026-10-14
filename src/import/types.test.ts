import { ankiDueAtMs } from './types';

const CRT = 1_600_000_000;

describe('ankiDueAtMs', () => {
  it('treats review due as days since collection crt', () => {
    const dueMs = ankiDueAtMs(CRT, { type: 2, due: 10 }, 0);
    expect(dueMs).toBe((CRT + 10 * 86_400) * 1000);
  });

  it('treats learning due as unix seconds', () => {
    const sec = 1_700_000_000;
    expect(ankiDueAtMs(CRT, { type: 1, due: sec }, 0)).toBe(sec * 1000);
  });

  it('uses now for new cards', () => {
    const now = 1_800_000_000_000;
    expect(ankiDueAtMs(CRT, { type: 0, due: 5 }, now)).toBe(now);
  });
});
