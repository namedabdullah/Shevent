// Edge cases required by testing/PHASE_TESTING.md S2 for PKR formatting.
import { describe, expect, it } from 'vitest';
import { formatNumber, formatPkr, formatPkrCompact, formatPkrRange, parsePkr } from './index';

describe('PKR boundaries (lakh / crore)', () => {
  it.each([
    [0, 'Rs 0'],
    [99_999, 'Rs 99,999'],
    [100_000, 'Rs 1 lakh'],
    [99_999.6, 'Rs 1 lakh'],
    [9_950_000, 'Rs 99.5 lakh'],
    [9_999_999, 'Rs 1 crore'],
    [10_000_000, 'Rs 1 crore'],
    [100_000_000, 'Rs 10 crore'],
  ])('compact %d → %s', (value, expected) => {
    expect(formatPkrCompact(value)).toBe(expected);
  });

  it('formats full amounts around the boundaries', () => {
    expect(formatPkr(99_999)).toBe('Rs 99,999');
    expect(formatPkr(100_000)).toBe('Rs 100,000');
    expect(formatPkr(10_000_000)).toBe('Rs 10,000,000');
  });

  it('handles decimals and negatives', () => {
    expect(formatNumber(1234.4)).toBe('1,234');
    expect(formatNumber(1234.5)).toBe('1,235');
    expect(formatNumber(-85_000)).toBe('-85,000');
    expect(formatPkrCompact(1_234_567)).toBe('Rs 12.35 lakh');
  });

  it('formats a range that straddles lakh and crore', () => {
    expect(formatPkrRange(99_999, 10_000_000)).toBe('Rs 99,999 – 1 crore');
  });

  it('parses a decimal lakh and rejects junk', () => {
    expect(parsePkr('2.5 lakh')).toBe(250_000);
    expect(parsePkr('0')).toBe(0);
    expect(parsePkr('-5 lakh')).toBeUndefined();
    expect(parsePkr('😀')).toBeUndefined();
    expect(parsePkr('1'.repeat(40))).toBeTypeOf('number');
  });
});
