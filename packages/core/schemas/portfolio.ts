// POST /v1/portfolio/check (#7 Verified Portfolios): multipart upload of `vendor_id` + `image`.
// Returns CLIP tags and the two-layer duplicate check (pHash distance, then CLIP similarity).

import { z } from 'zod';
import { modelVersionSchema } from './common';

export const DUPLICATE_STATUSES = ['unique', 'possible_duplicate', 'duplicate'] as const;
export type DuplicateStatus = (typeof DUPLICATE_STATUSES)[number];

export const portfolioCheckResponseSchema = z.object({
  tags: z.array(z.object({ label: z.string(), score: z.number().min(0).max(1) })),
  duplicate: z.object({
    status: z.enum(DUPLICATE_STATUSES),
    matches: z.array(
      z.object({
        media_id: z.string(),
        vendor_id: z.string(),
        phash_distance: z.int().nonnegative(),
        clip_similarity: z.number().min(-1).max(1),
      }),
    ),
  }),
  phash: z.string(),
  model_version: modelVersionSchema,
});
export type PortfolioCheckResponse = z.infer<typeof portfolioCheckResponseSchema>;
