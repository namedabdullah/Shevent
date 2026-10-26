import { describe, expect, it } from 'vitest';
import { slugify } from '../format';
import { hasContactDetails, quoteTotalPkr, splitList, vendorProfileSchema, vendorQuoteSchema } from './index';

const profile = {
  name: 'Demo Caterers Johar Town',
  category: 'catering',
  base_area: 'Johar Town',
  areas_served: ['Johar Town', 'Gulberg'],
  event_types: ['wedding_mehndi'],
  inclusions: ['Serving staff'],
  public_consent: false,
} as const;

describe('hasContactDetails', () => {
  it.each(['Call 0300 1234567', 'WhatsApp +92-300-1234567', '03001234567', 'mail us at hi@example.com'])('finds contact details in %j', (text) => {
    expect(hasContactDetails(text)).toBe(true);
  });

  it.each(['Rs 1,800 per head for 300 guests', 'Valid until 2026-12-19', 'Serving staff, 2 live stations', 'Capacity 1000'])('leaves ordinary text alone: %j', (text) => {
    expect(hasContactDetails(text)).toBe(false);
  });
});

describe('vendorProfileSchema', () => {
  it('accepts a complete listing', () => {
    expect(vendorProfileSchema.safeParse(profile).success).toBe(true);
  });

  it('rejects contact details in the name, description and inclusions', () => {
    expect(vendorProfileSchema.safeParse({ ...profile, name: 'Caterers 0300 1234567' }).success).toBe(false);
    expect(vendorProfileSchema.safeParse({ ...profile, description: 'Email me: a@b.co' }).success).toBe(false);
    expect(vendorProfileSchema.safeParse({ ...profile, inclusions: ['Call 03001234567'] }).success).toBe(false);
  });

  it('rejects a smallest event larger than the largest', () => {
    const result = vendorProfileSchema.safeParse({ ...profile, capacity_min: 500, capacity_max: 100 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['capacity_max']);
  });

  it('allows a venue type only for venues', () => {
    expect(vendorProfileSchema.safeParse({ ...profile, sub_type: 'marquee' }).success).toBe(false);
    expect(vendorProfileSchema.safeParse({ ...profile, category: 'venue', sub_type: 'marquee' }).success).toBe(true);
  });

  it('rejects a one-letter name, an unknown area and empty list items', () => {
    expect(vendorProfileSchema.safeParse({ ...profile, name: 'A' }).success).toBe(false);
    expect(vendorProfileSchema.safeParse({ ...profile, base_area: 'Karachi' }).success).toBe(false);
    expect(vendorProfileSchema.safeParse({ ...profile, inclusions: ['  '] }).success).toBe(false);
  });
});

describe('vendorQuoteSchema', () => {
  const quote = { amount_pkr: 3000, unit: 'per_head', inclusions: [], exclusions: [] } as const;

  it('accepts a per-head quote', () => {
    expect(vendorQuoteSchema.safeParse(quote).success).toBe(true);
  });

  it('needs hours for an hourly quote', () => {
    expect(vendorQuoteSchema.safeParse({ ...quote, unit: 'per_hour' }).success).toBe(false);
    expect(vendorQuoteSchema.safeParse({ ...quote, unit: 'per_hour', hours: 4.5 }).success).toBe(true);
    expect(vendorQuoteSchema.safeParse({ ...quote, unit: 'per_hour', hours: 25 }).success).toBe(false);
  });

  it('rejects zero, fractional and too-large prices', () => {
    for (const amount_pkr of [0, 99.5, 500_000_001]) expect(vendorQuoteSchema.safeParse({ ...quote, amount_pkr }).success).toBe(false);
  });

  it('rejects contact details in the notes and an impossible date', () => {
    expect(vendorQuoteSchema.safeParse({ ...quote, notes: 'WhatsApp 0300 1234567' }).success).toBe(false);
    expect(vendorQuoteSchema.safeParse({ ...quote, valid_until: '2026-02-30' }).success).toBe(false);
  });
});

describe('quoteTotalPkr', () => {
  it('multiplies per-head prices by guests and hourly prices by hours', () => {
    expect(quoteTotalPkr(3000, 'per_head', 300, undefined)).toBe(900_000);
    expect(quoteTotalPkr(15_000, 'per_hour', 300, 4.5)).toBe(67_500);
    expect(quoteTotalPkr(250_000, 'per_event', 300)).toBe(250_000);
    expect(quoteTotalPkr(400_000, 'per_slot', 300)).toBe(400_000);
  });
});

describe('splitList', () => {
  it('splits on lines and commas and drops blanks', () => {
    expect(splitList('Serving staff, Crockery\n\n  Transport  ,')).toEqual(['Serving staff', 'Crockery', 'Transport']);
  });
});

describe('slugify', () => {
  it.each([
    ['Demo DJ & Dhol Cantt', 'demo-dj-dhol-cantt'],
    ['  Café Lahore!! ', 'cafe-lahore'],
    ['---', ''],
    ['شادی ہال', ''],
  ])('%j → %j', (name, slug) => {
    expect(slugify(name)).toBe(slug);
  });

  it('keeps slugs within 60 characters without a trailing dash', () => {
    const slug = slugify(`${'a'.repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });
});
