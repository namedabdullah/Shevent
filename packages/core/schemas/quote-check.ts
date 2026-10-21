// POST /v1/quote-check (#5 Quote Fairness Checker): compares a vendor's quote with #2's range for
// the same spec. Used by the host's quote view and the vendor's live preview before sending.

import { z } from 'zod';
import { CATEGORIES, PRICE_UNITS } from '../enums';
import { FAIRNESS_LEVELS } from '../labels';
import { modelVersionSchema, priceRangeSchema } from './common';
import { estimateRequestSchema } from './estimate';

export const quoteCheckRequestSchema = z.object({
  plan: estimateRequestSchema,
  category: z.enum(CATEGORIES),
  quoted_pkr: z.number().positive(),
  unit: z.enum(PRICE_UNITS),
  /** Needed for per_hour quotes. */
  hours: z.number().positive().max(24).optional(),
  inclusions: z.array(z.string().trim().min(1).max(100)).max(50),
  notes: z.string().max(2000).optional(),
});
export type QuoteCheckRequest = z.infer<typeof quoteCheckRequestSchema>;

export const quoteCheckResponseSchema = z.object({
  level: z.enum(FAIRNESS_LEVELS),
  /** Typical range in the same unit as the quote. */
  typical_range: priceRangeSchema,
  unit: z.enum(PRICE_UNITS),
  /** How far above the top of the range, in percent; null when inside or below it. */
  percent_above_high: z.number().nonnegative().nullable(),
  /** Inclusion checklist items the quote doesn't mention ("Generator fuel", "Setup and teardown"…). */
  ask_about: z.array(z.string()),
  model_version: modelVersionSchema,
});
export type QuoteCheckResponse = z.infer<typeof quoteCheckResponseSchema>;
