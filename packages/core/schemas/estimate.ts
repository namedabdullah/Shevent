// POST /v1/estimate (#1 Budget Allocator + #2 Price Range Estimator), following README §9.
// Hand-written until the FastAPI server exists; then these are checked against the generated
// types/openapi.d.ts. Category keys follow data/reference/categories.csv (`dj_sound`, not `audio_dj`).

import { z } from 'zod';
import { AREAS, CATEGORIES, EVENT_TYPES, VENUE_TYPES } from '../enums';
import { modelVersionSchema, priceRangeSchema } from './common';

export const estimateRequestSchema = z.object({
  event_type: z.enum(EVENT_TYPES),
  guest_count: z.int().min(10).max(5000),
  area: z.enum(AREAS),
  venue_type: z.enum(VENUE_TYPES).optional(),
  event_date: z.iso.date(),
  total_budget_pkr: z.int().min(10_000).max(500_000_000),
  preferences: z.array(z.string().max(40)).max(10).optional(),
});
export type EstimateRequest = z.infer<typeof estimateRequestSchema>;

/** The event itself, without the host's budget (what a vendor may see; what #5 prices). */
export const eventSpecSchema = estimateRequestSchema.omit({ total_budget_pkr: true });
export type EventSpec = z.infer<typeof eventSpecSchema>;

export const allocationItemSchema = z.object({
  /** Share of the total budget, 0–1. */
  share: z.number().min(0).max(1),
  /** Budget allocated to this category (share × total). */
  pkr: z.number().nonnegative(),
  /** #2's 80% price range for this category, which can disagree with the allocation. */
  range: priceRangeSchema,
});
export type AllocationItem = z.infer<typeof allocationItemSchema>;

export const estimateResponseSchema = z.object({
  allocation: z
    .record(z.enum(CATEGORIES), allocationItemSchema)
    .refine((allocation) => Math.abs(Object.values(allocation).reduce((sum, item) => sum + item.share, 0) - 1) < 0.01, {
      message: 'shares must sum to 1',
    }),
  season_factor: z.string().nullish(),
  warnings: z.array(z.string()),
  explanations: z.array(z.string()),
  model_version: modelVersionSchema,
});
export type EstimateResponse = z.infer<typeof estimateResponseSchema>;
