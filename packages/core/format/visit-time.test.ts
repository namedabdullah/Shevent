import { describe, expect, it } from 'vitest';
import { formatVisitTime, lahoreDateTime } from './index';

describe('lahoreDateTime', () => {
  it('builds a Lahore instant', () => {
    expect(lahoreDateTime('2026-12-12', '16:30')).toBe('2026-12-12T16:30:00+05:00');
    expect(new Date(lahoreDateTime('2026-12-12', '16:30')!).toISOString()).toBe('2026-12-12T11:30:00.000Z');
  });

  it.each([
    ['2026-02-30', '10:00'],
    ['2026-12-12', '24:00'],
    ['2026-12-12', '4:30'],
    ['12/12/2026', '10:00'],
  ])('rejects %s %s', (date, time) => expect(lahoreDateTime(date, time)).toBeUndefined());
});

describe('formatVisitTime', () => {
  it('shows Lahore time, whatever the device timezone', () => {
    expect(formatVisitTime('2026-12-12T11:30:00Z')).toBe('Sat, 12 Dec 2026, 4:30 pm');
    expect(formatVisitTime('2026-12-12T16:30:00+05:00')).toBe('Sat, 12 Dec 2026, 4:30 pm');
  });

  it('handles noon, midnight and the date line in Lahore', () => {
    expect(formatVisitTime('2026-12-12T07:00:00Z')).toBe('Sat, 12 Dec 2026, 12:00 pm');
    expect(formatVisitTime('2026-12-12T19:05:00Z')).toBe('Sun, 13 Dec 2026, 12:05 am');
  });

  it('leaves junk alone', () => expect(formatVisitTime('soon')).toBe('soon'));
});
