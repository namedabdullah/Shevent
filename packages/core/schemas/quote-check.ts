// POST /v1/quote-check (#5 Quote Fairness Checker): compares a vendor's quote with #2's range for
// the same spec. Used by the host's quote view and the vendor's live preview before sending.

import { z } from 'zod';
import { CATEGORIES, PRICE_TIERS, PRICE_UNITS } from '../enums';
import { FAIRNESS_LEVELS } from '../labels';
import { modelVersionSchema, priceRangeSchema } from './common';
import { eventSpecSchema } from './estimate';

export const quoteCheckRequestSchema = z.object({
  /** The event, without the host's budget: a fair price doesn't depend on it, and vendors never see it. */
  plan: eventSpecSchema,
  category: z.enum(CATEGORIES),
  quoted_pkr: z.number().positive(),
  unit: z.enum(PRICE_UNITS),
  /** Needed for per_hour quotes. */
  hours: z.number().positive().max(24).optional(),
  inclusions: z.array(z.string().trim().min(1).max(100)).max(50),
  /** What the quote says is not in the price. */
  exclusions: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  notes: z.string().max(2000).optional(),
  /** The vendor's tier from its listing. With it the quote is compared with vendors of the same tier. */
  vendor_tier: z.enum(PRICE_TIERS).optional(),
});
export type QuoteCheckRequest = z.infer<typeof quoteCheckRequestSchema>;

export const quoteCheckResponseSchema = z.object({
  level: z.enum(FAIRNESS_LEVELS),
  /** Typical range in the same unit as the quote. */
  typical_range: priceRangeSchema,
  unit: z.enum(PRICE_UNITS),
  /** How far above the top of the range, in percent; null when inside or below it. */
  percent_above_high: z.number().nonnegative().nullable(),
  /** How far below the bottom of the range, in percent; null when inside or above it. Still green. */
  percent_below_low: z.number().nonnegative().nullable(),
  /** Inclusion checklist items the quote doesn't mention ("Generator fuel", "Setup and teardown"…). */
  ask_about: z.array(z.string()),
  /** Checklist items the quote says cost extra, then its other exclusions as written. */
  charged_extra: z.array(z.string()),
  /** same_tier: compared with vendors of the vendor's tier; all_vendors: tier unknown. */
  compared_with: z.enum(['same_tier', 'all_vendors']),
  model_version: modelVersionSchema,
});
export type QuoteCheckResponse = z.infer<typeof quoteCheckResponseSchema>;
