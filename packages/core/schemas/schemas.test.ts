import { describe, expect, it } from 'vitest';
import { estimateRequestFixture, estimateResponseFixture } from '../fixtures';
import { estimateRequestSchema, estimateResponseSchema, leadSchema } from './index';

describe('estimate schemas', () => {
  it('accept the README §9 fixtures', () => {
    expect(estimateRequestSchema.safeParse(estimateRequestFixture).success).toBe(true);
    expect(estimateResponseSchema.safeParse(estimateResponseFixture).success).toBe(true);
  });

  it('reject unknown areas and impossible dates', () => {
    expect(estimateRequestSchema.safeParse({ ...estimateRequestFixture, area: 'Karachi' }).success).toBe(false);
    expect(estimateRequestSchema.safeParse({ ...estimateRequestFixture, event_date: '2026-02-30' }).success).toBe(false);
  });

  it('reject shares that do not sum to 1', () => {
    const allocation = { ...estimateResponseFixture.allocation, venue: { share: 0.5, pkr: 1, range: [0, 2] } };
    expect(estimateResponseSchema.safeParse({ ...estimateResponseFixture, allocation }).success).toBe(false);
  });

  it('reject a missing category', () => {
    const { lighting: _, ...allocation } = estimateResponseFixture.allocation;
    expect(estimateResponseSchema.safeParse({ ...estimateResponseFixture, allocation }).success).toBe(false);
  });
});

describe('lead schema', () => {
  it('accepts a waitlist email or phone number', () => {
    expect(leadSchema.safeParse({ type: 'waitlist', contact: 'host@example.com' }).success).toBe(true);
    expect(leadSchema.safeParse({ type: 'waitlist', contact: '0300-1234567' }).success).toBe(true);
    expect(leadSchema.safeParse({ type: 'waitlist', contact: '+92 300 1234567' }).success).toBe(true);
  });

  it('rejects contacts that are neither', () => {
    expect(leadSchema.safeParse({ type: 'waitlist', contact: 'hello' }).success).toBe(false);
    expect(leadSchema.safeParse({ type: 'waitlist', contact: '12345' }).success).toBe(false);
  });

  it('requires a business name and category to join as a vendor', () => {
    const result = leadSchema.safeParse({ type: 'vendor_join', contact: 'v@example.com' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['name', 'category']);
    expect(
      leadSchema.safeParse({ type: 'vendor_join', contact: 'v@example.com', name: 'Lights Co', category: 'lighting' }).success,
    ).toBe(true);
  });
});
