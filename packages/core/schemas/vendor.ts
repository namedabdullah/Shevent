// Vendor listing (onboarding and profile) and the quote a vendor sends on an inquiry.
// Length and range limits match the check constraints in supabase/migrations.

import { z } from 'zod';
import { AREAS, CATEGORIES, EVENT_TYPES, PRICE_TIERS, PRICE_UNITS, VENUE_TYPES, type PriceUnit } from '../enums';

const EMAIL_IN_TEXT = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
// 10–13 digits written with optional spaces, dashes or a leading +: "0300 1234567", "+92-300-1234567".
const PHONE_IN_TEXT = /\+?\d(?:[\s-]?\d){9,12}/;

/**
 * Listings and quotes are shown to other people, and hosts reach vendors through Shevent chat, so
 * free text must not carry a phone number or an email address (README §13, WEB_APP_PLAN §6).
 */
export function hasContactDetails(text: string): boolean {
  return EMAIL_IN_TEXT.test(text) || PHONE_IN_TEXT.test(text);
}

const publicText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !hasContactDetails(value), { message: 'Remove phone numbers and email addresses' });

const listItem = publicText(100).pipe(z.string().min(1));

export const vendorProfileSchema = z
  .object({
    name: publicText(120).pipe(z.string().min(2)),
    category: z.enum(CATEGORIES),
    /** Venue type, for venues only. */
    sub_type: z.enum(VENUE_TYPES).optional(),
    base_area: z.enum(AREAS),
    areas_served: z.array(z.enum(AREAS)).max(AREAS.length),
    capacity_min: z.int().min(1).max(100_000).optional(),
    capacity_max: z.int().min(1).max(100_000).optional(),
    price_tier: z.enum(PRICE_TIERS).optional(),
    event_types: z.array(z.enum(EVENT_TYPES)).max(EVENT_TYPES.length),
    description: publicText(2000).optional(),
    inclusions: z.array(listItem).max(50),
    years_active: z.int().min(0).max(100).optional(),
    public_consent: z.boolean(),
  })
  .superRefine((profile, ctx) => {
    if (profile.capacity_min !== undefined && profile.capacity_max !== undefined && profile.capacity_min > profile.capacity_max) {
      ctx.addIssue({ code: 'custom', path: ['capacity_max'], message: 'The largest event must be at least the smallest' });
    }
    if (profile.sub_type !== undefined && profile.category !== 'venue') {
      ctx.addIssue({ code: 'custom', path: ['sub_type'], message: 'Only venues have a venue type' });
    }
  });
export type VendorProfile = z.infer<typeof vendorProfileSchema>;

export const vendorQuoteSchema = z
  .object({
    /** Price in `unit`: what #5 checks. */
    amount_pkr: z.int().min(1).max(500_000_000),
    unit: z.enum(PRICE_UNITS),
    /** Needed for per_hour quotes. */
    hours: z.number().positive().max(24).multipleOf(0.5).optional(),
    inclusions: z.array(listItem).max(50),
    exclusions: z.array(listItem).max(50),
    notes: publicText(2000).optional(),
    valid_until: z.iso.date().optional(),
  })
  .superRefine((quote, ctx) => {
    if (quote.unit === 'per_hour' && quote.hours === undefined) {
      ctx.addIssue({ code: 'custom', path: ['hours'], message: 'Enter the number of hours' });
    }
  });
export type VendorQuote = z.infer<typeof vendorQuoteSchema>;

/**
 * What the host would pay: per-head prices × guests, hourly prices × hours, anything else as is.
 * Worked out on the server from the inquiry, so the total can't disagree with the price.
 */
export function quoteTotalPkr(amount: number, unit: PriceUnit, guestCount: number, hours?: number): number {
  if (unit === 'per_head') return amount * guestCount;
  if (unit === 'per_hour') return Math.round(amount * (hours ?? 0));
  return amount;
}

/** Splits a textarea into list items: one per line or comma, blanks dropped. */
export function splitList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
