export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export function fixedClock(start: number): Clock & { set(t: number): void; advance(ms: number): void } {
  let t = start;
  return {
    now: () => t,
    set: (next) => {
      t = next;
    },
    advance: (ms) => {
      t += ms;
    },
  };
}

export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
