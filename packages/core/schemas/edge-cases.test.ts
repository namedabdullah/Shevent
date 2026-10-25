// Edge cases required by testing/PHASE_TESTING.md S2 for the zod schemas and the quote-check labels.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AREAS, CATEGORIES, EVENT_TYPES, VENUE_TYPES } from '../enums';
import { estimateRequestFixture, fixtureQuoteCheck } from '../fixtures';
import { estimateRequestSchema, quoteCheckRequestSchema, type QuoteCheckRequest } from './index';

const base = estimateRequestFixture;
const accepts = (overrides: Record<string, unknown>) => estimateRequestSchema.safeParse({ ...base, ...overrides }).success;

describe('estimate request rejects bad input', () => {
  it.each([0, -1, -300, 9, 5001, 1.5, Number.NaN])('guest_count %s', (guest_count) => {
    expect(accepts({ guest_count })).toBe(false);
  });

  it.each([0, -1, 9_999, 500_000_001, Number.NaN])('total_budget_pkr %s', (total_budget_pkr) => {
    expect(accepts({ total_budget_pkr })).toBe(false);
  });

  it('accepts the budget limits themselves', () => {
    expect(accepts({ total_budget_pkr: 10_000 })).toBe(true);
    expect(accepts({ total_budget_pkr: 500_000_000 })).toBe(true);
    expect(accepts({ guest_count: 10 })).toBe(true);
    expect(accepts({ guest_count: 5000 })).toBe(true);
  });

  it.each(['event_type', 'guest_count', 'area', 'event_date', 'total_budget_pkr'])('missing %s', (field) => {
    const { [field as keyof typeof base]: _removed, ...rest } = base;
    expect(estimateRequestSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects unknown categories, areas and event types', () => {
    expect(accepts({ area: 'Karachi' })).toBe(false);
    expect(accepts({ event_type: 'funeral' })).toBe(false);
    expect(accepts({ venue_type: 'castle' })).toBe(false);
    expect(quoteCheckRequestSchema.safeParse({ plan: base, category: 'catering ', quoted_pkr: 1, unit: 'per_head', inclusions: [] }).success).toBe(false);
  });

  it('rejects text where numbers belong, emoji and very long text', () => {
    expect(accepts({ guest_count: '300 guests' })).toBe(false);
    expect(accepts({ area: '😀' })).toBe(false);
    expect(accepts({ preferences: ['x'.repeat(41)] })).toBe(false);
    expect(accepts({ preferences: Array.from({ length: 11 }, () => 'a') })).toBe(false);
  });
});

describe('estimate request accepts every reference value', () => {
  it.each([...AREAS])('area %s', (area) => expect(accepts({ area })).toBe(true));
  it.each([...EVENT_TYPES])('event type %s', (event_type) => expect(accepts({ event_type })).toBe(true));
  it.each([...VENUE_TYPES])('venue type %s', (venue_type) => expect(accepts({ venue_type })).toBe(true));
  it.each([...CATEGORIES])('quote category %s', (category) => {
    const request = { plan: base, category, quoted_pkr: 1000, unit: 'per_event', inclusions: [] };
    expect(quoteCheckRequestSchema.safeParse(request).success).toBe(true);
  });
});

describe('a vendor never receives the host budget in a quote check', () => {
  it('quote-check plans carry no budget field', () => {
    const parsed = quoteCheckRequestSchema.parse({
      plan: { ...base, total_budget_pkr: 2_500_000 },
      category: 'catering',
      quoted_pkr: 3000,
      unit: 'per_head',
      inclusions: [],
    });
    expect('total_budget_pkr' in parsed.plan).toBe(false);
  });
});

// #5: green inside the range, yellow up to 25% above the top, red beyond (IMPLEMENTATION_PLAN §7).
describe('#5 fairness label boundaries (fixture rule)', () => {
  const quote = (quoted_pkr: number): QuoteCheckRequest => ({
    plan: base,
    category: 'catering',
    quoted_pkr,
    unit: 'per_head',
    inclusions: [],
  });
  const { typical_range } = fixtureQuoteCheck(quote(1));
  const top = typical_range[1];

  it.each([
    ['below the range', typical_range[0] - 1, 'green'],
    ['inside the range', Math.round((typical_range[0] + top) / 2), 'green'],
    ['exactly the top of the range', top, 'green'],
    ['just above the top', top + 1, 'yellow'],
    ['exactly 25% above', top * 1.25, 'yellow'],
    ['just over 25% above', top * 1.25 + 1, 'red'],
    ['far above', top * 3, 'red'],
  ])('%s → %s', (_name, quoted, level) => {
    expect(fixtureQuoteCheck(quote(quoted)).level).toBe(level);
  });
});

describe('fixtures follow the reference CSVs', () => {
  it('reference files exist and are non-empty', () => {
    for (const file of ['areas.csv', 'categories.csv', 'vocab.csv']) {
      const text = readFileSync(fileURLToPath(new URL(`../../../data/reference/${file}`, import.meta.url)), 'utf8');
      expect(text.trim().split(/\r?\n/).length).toBeGreaterThan(1);
    }
  });
});
