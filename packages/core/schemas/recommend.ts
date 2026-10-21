// POST /v1/recommend (#3 Vendor Matching): ranked vendors for one category of a plan.
// Sponsored results come back in their own list and never change a vendor's score.

import { z } from 'zod';
import { CATEGORIES } from '../enums';
import { modelVersionSchema, priceRangeSchema, vendorSummarySchema } from './common';
import { estimateRequestSchema } from './estimate';

export const recommendRequestSchema = z.object({
  plan: estimateRequestSchema,
  category: z.enum(CATEGORIES),
  /** This category's budget from #1 (allocation[category].pkr). */
  budget_pkr: z.int().nonnegative(),
  limit: z.int().min(1).max(50).optional(),
});
export type RecommendRequest = z.infer<typeof recommendRequestSchema>;

export const matchSchema = vendorSummarySchema.extend({
  /** Weighted fit score, 0–1. */
  score: z.number().min(0).max(1),
  /** #2's estimate for this vendor and event. */
  price_range: priceRangeSchema,
  /** Plain-language reasons, e.g. "Serves Gulberg", "Fits 300 guests". */
  reasons: z.array(z.string()).min(1),
  /** Got the small exposure boost for vendors without much history. */
  is_new: z.boolean(),
});
export type Match = z.infer<typeof matchSchema>;

export const recommendResponseSchema = z.object({
  category: z.enum(CATEGORIES),
  matches: z.array(matchSchema),
  sponsored: z.array(matchSchema),
  model_version: modelVersionSchema,
});
export type RecommendResponse = z.infer<typeof recommendResponseSchema>;
