export const DAY_CUTOFF_HOUR = 4;

type Wall = { y: number; m: number; d: number; h: number; min: number; s: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function wallClock(t: number, tz: string): Wall {
  const parts = formatter(tz).formatToParts(t);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour') % 24, min: get('minute'), s: get('second') };
}

function wallAsUtc(w: Wall): number {
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s);
}

/** Epoch ms for a wall-clock time in tz (estimate from UTC, corrected up to 3 times for the zone offset). */
export function zonedTimeToUtc(y: number, m: number, d: number, h: number, tz: string): number {
  const target = Date.UTC(y, m - 1, d, h);
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const diff = wallAsUtc(wallClock(guess, tz)) - target;
    if (diff === 0) break;
    guess -= diff;
  }
  return guess;
}

/** Latest local DAY_CUTOFF_HOUR at or before t. */
export function dayStart(t: number, tz: string): number {
  const w = wallClock(t, tz);
  const base = new Date(Date.UTC(w.y, w.m - 1, w.d - (w.h < DAY_CUTOFF_HOUR ? 1 : 0)));
  return zonedTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), DAY_CUTOFF_HOUR, tz);
}

/** Calendar-day addition that keeps the local cutoff hour across DST changes (not 24h × n). */
export function addDays(dayStartT: number, n: number, tz: string): number {
  const w = wallClock(dayStartT, tz);
  const base = new Date(Date.UTC(w.y, w.m - 1, w.d + n));
  return zonedTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), DAY_CUTOFF_HOUR, tz);
}

export function dayEnd(t: number, tz: string): number {
  return addDays(dayStart(t, tz), 1, tz);
}

/** Number of study days between two instants (0 = same study day). */
export function studyDaysBetween(from: number, to: number, tz: string): number {
  const a = wallClock(dayStart(from, tz), tz);
  const b = wallClock(dayStart(to, tz), tz);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}
