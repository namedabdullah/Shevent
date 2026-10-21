// POST /v1/feedback: post-event actual spend and rating, for retraining (README §11).

import { z } from 'zod';
import { CATEGORIES } from '../enums';
import { estimateRequestSchema } from './estimate';

export const feedbackRequestSchema = z.object({
  plan_id: z.string(),
  plan: estimateRequestSchema,
  actual_spend_pkr: z.partialRecord(z.enum(CATEGORIES), z.number().nonnegative()),
  guest_count_actual: z.int().min(1).max(10_000).optional(),
  rating: z.int().min(1).max(5),
});
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;

export const feedbackResponseSchema = z.object({
  accepted: z.boolean(),
});
export type FeedbackResponse = z.infer<typeof feedbackResponseSchema>;
