// POST /v1/reviews/insights (#6 Review Insights): aspect sentiment and a pros/cons summary.

import { z } from 'zod';
import { modelVersionSchema } from './common';

export const REVIEW_ASPECTS = [
  'punctuality',
  'food_quality',
  'sound_quality',
  'staff_behaviour',
  'value_for_money',
  'hidden_charges',
] as const;
export type ReviewAspect = (typeof REVIEW_ASPECTS)[number];

export const REVIEW_ASPECT_LABELS: Record<ReviewAspect, string> = {
  punctuality: 'Punctuality',
  food_quality: 'Food quality',
  sound_quality: 'Sound quality',
  staff_behaviour: 'Staff behaviour',
  value_for_money: 'Value for money',
  hidden_charges: 'Hidden charges',
};

export const reviewInsightsRequestSchema = z.object({
  vendor_id: z.string(),
});
export type ReviewInsightsRequest = z.infer<typeof reviewInsightsRequestSchema>;

export const aspectSummarySchema = z.object({
  aspect: z.enum(REVIEW_ASPECTS),
  positive: z.int().nonnegative(),
  negative: z.int().nonnegative(),
});

export const reviewInsightsResponseSchema = z.object({
  vendor_id: z.string(),
  review_count: z.int().nonnegative(),
  aspects: z.array(aspectSummarySchema),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  model_version: modelVersionSchema,
});
export type ReviewInsightsResponse = z.infer<typeof reviewInsightsResponseSchema>;
