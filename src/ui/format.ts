import { studyDaysBetween, wallClock } from '@/domain/scheduler/day';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export function formatHeaderDate(t: number, tz: string): string {
  const w = wallClock(t, tz);
  const wd = new Date(Date.UTC(w.y, w.m - 1, w.d)).getUTCDay();
  return `${w.m}月${w.d}日(${WEEKDAYS[wd]})`;
}

export function formatShortDate(t: number, tz: string): string {
  const w = wallClock(t, tz);
  return `${w.m}/${w.d}`;
}

export function formatDateTime(t: number, tz: string): string {
  const w = wallClock(t, tz);
  return `${w.m}月${w.d}日 ${w.h}:${String(w.min).padStart(2, '0')}`;
}

/** Due count badge text: capped at 99+. */
export function formatCount(n: number): string {
  return n > 99 ? '99+' : String(n);
}

/** Caption for the next interval on answer buttons: 「10分後」「明日」「6日後」. */
export function formatInterval(from: number, due: number, tz: string): string {
  const mins = Math.round((due - from) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}分後`;
  const days = studyDaysBetween(from, due, tz);
  if (days <= 0) return `${Math.round(mins / 60)}時間後`;
  if (days === 1) return '明日';
  if (days < 365) return `${days}日後`;
  return `${Math.round(days / 36.5) / 10}年後`;
}

export function formatRelativeDay(t: number | null, now: number, tz: string): string | null {
  if (t === null) return null;
  const days = studyDaysBetween(t, now, tz);
  if (days <= 0) return '今日';
  if (days === 1) return '昨日';
  return `${days}日前`;
}
