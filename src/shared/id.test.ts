import { fixedClock } from './clock';
import { createIdGenerator } from './id';

describe('createIdGenerator', () => {
  it('produces sortable RFC 9562 v7 ids', () => {
    const clock = fixedClock(Date.parse('2026-10-11T00:00:00Z'));
    let n = 0;
    const gen = createIdGenerator(clock, (len) => new Uint8Array(len).fill(n++ & 0xff));
    const a = gen();
    clock.advance(1);
    const b = gen();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
    expect(parseInt(a.replace(/-/g, '').slice(0, 12), 16)).toBe(clock.now() - 1);
  });
});
