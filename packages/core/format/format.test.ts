import { describe, expect, it } from 'vitest';
import {
  formatEventDate,
  formatNumber,
  formatPkr,
  formatPkrCompact,
  formatPkrPerUnit,
  formatPkrRange,
  parseIsoDate,
  parsePkr,
  todayInLahore,
} from './index';

describe('PKR formatting', () => {
  it('groups thousands', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(2_500_000)).toBe('2,500,000');
    expect(formatNumber(1799.6)).toBe('1,800');
    expect(formatPkr(85_000)).toBe('Rs 85,000');
  });

  it('uses lakh and crore for compact amounts', () => {
    expect(formatPkrCompact(85_000)).toBe('Rs 85,000');
    expect(formatPkrCompact(100_000)).toBe('Rs 1 lakh');
    expect(formatPkrCompact(2_500_000)).toBe('Rs 25 lakh');
    expect(formatPkrCompact(2_475_000)).toBe('Rs 24.75 lakh');
    expect(formatPkrCompact(12_500_000)).toBe('Rs 1.25 crore');
  });

  it('formats ranges', () => {
    expect(formatPkrRange(650_000, 880_000)).toBe('Rs 6.5–8.8 lakh');
    expect(formatPkrRange(85_000, 120_000)).toBe('Rs 85,000 – 1.2 lakh');
    expect(formatPkrRange(9_000_000, 11_000_000)).toBe('Rs 90 lakh – 1.1 crore');
  });

  it('formats per-unit prices', () => {
    expect(formatPkrPerUnit(1800, 'per_head')).toBe('Rs 1,800 per head');
  });
});

describe('parsePkr', () => {
  it.each([
    ['25 lakh', 2_500_000],
    ['25 lac', 2_500_000],
    ['25L', 2_500_000],
    ['2.5 lakhs', 250_000],
    ['1 crore', 10_000_000],
    ['2 crores', 20_000_000],
    ['1.5cr', 15_000_000],
    ['2.5m', 2_500_000],
    ['85k', 85_000],
    ['85 hazar', 85_000],
    ['Rs 2,500,000', 2_500_000],
    ['PKR 300000', 300_000],
    ['Rs. 25 lakh', 2_500_000],
  ])('%s → %d', (input, expected) => {
    expect(parsePkr(input)).toBe(expected);
  });

  it.each(['', 'lakh', 'around 25 lakh', '25 dollars', '1-2 lakh'])('rejects %j', (input) => {
    expect(parsePkr(input)).toBeUndefined();
  });
});

describe('dates', () => {
  it('formats date-only values without timezone shifts', () => {
    expect(formatEventDate('2026-12-19')).toBe('Sat, 19 Dec 2026');
    expect(formatEventDate('not a date')).toBe('not a date');
  });

  it('rejects impossible dates', () => {
    expect(parseIsoDate('2026-02-30')).toBeUndefined();
    expect(parseIsoDate('2026-02-28')).toBeInstanceOf(Date);
  });

  it('computes today in Lahore (UTC+5)', () => {
    expect(todayInLahore(new Date('2026-10-21T18:59:00Z'))).toBe('2026-10-21');
    expect(todayInLahore(new Date('2026-10-21T19:00:00Z'))).toBe('2026-10-22');
  });
});
