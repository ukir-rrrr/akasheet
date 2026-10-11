import {
  formatCount,
  formatDateTime,
  formatHeaderDate,
  formatInterval,
  formatRelativeDay,
  formatShortDate,
} from './format';

const TZ = 'Asia/Tokyo';
const NOW = Date.parse('2026-10-11T13:05:00+09:00');
const MIN = 60_000;
const HOUR = 60 * MIN;

describe('format', () => {
  it('formats dates in the given time zone', () => {
    expect(formatHeaderDate(NOW, TZ)).toBe('10月11日(日)');
    expect(formatShortDate(NOW, TZ)).toBe('10/11');
    expect(formatDateTime(NOW, TZ)).toBe('10月11日 13:05');
    expect(formatHeaderDate(Date.parse('2026-10-11T16:00:00Z'), TZ)).toBe('10月12日(月)');
  });

  it('caps the due badge at 99+', () => {
    expect([0, 99, 100].map(formatCount)).toEqual(['0', '99', '99+']);
  });

  it('describes the next interval relative to the 4am day boundary', () => {
    expect(formatInterval(NOW, NOW, TZ)).toBe('1分後');
    expect(formatInterval(NOW, NOW + 10 * MIN, TZ)).toBe('10分後');
    expect(formatInterval(NOW, NOW + 3 * HOUR, TZ)).toBe('3時間後');
    expect(formatInterval(NOW, Date.parse('2026-10-12T04:00:00+09:00'), TZ)).toBe('明日');
    expect(formatInterval(NOW, NOW + 6 * 24 * HOUR, TZ)).toBe('6日後');
    expect(formatInterval(NOW, NOW + 730 * 24 * HOUR, TZ)).toBe('2年後');
  });

  it('describes when a card was last reviewed', () => {
    expect(formatRelativeDay(null, NOW, TZ)).toBeNull();
    expect(formatRelativeDay(NOW - HOUR, NOW, TZ)).toBe('今日');
    expect(formatRelativeDay(NOW - 24 * HOUR, NOW, TZ)).toBe('昨日');
    expect(formatRelativeDay(NOW - 5 * 24 * HOUR, NOW, TZ)).toBe('5日前');
  });
});
