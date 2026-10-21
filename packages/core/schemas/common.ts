import { z } from 'zod';
import { AREAS, CATEGORIES, PRICE_TIERS } from '../enums';

/** [low, high] in PKR. #2 returns an 80% range, never a single number. */
export const priceRangeSchema = z
  .tuple([z.number().nonnegative(), z.number().nonnegative()])
  .refine(([low, high]) => low <= high, { message: 'range low must be ≤ range high' });
export type PriceRange = z.infer<typeof priceRangeSchema>;

/** What match cards, package cards and the assistant show about a vendor. No contact details. */
export const vendorSummarySchema = z.object({
  vendor_id: z.string(),
  slug: z.string(),
  name: z.string(),
  category: z.enum(CATEGORIES),
  base_area: z.enum(AREAS),
  price_tier: z.enum(PRICE_TIERS).nullish(),
  verified: z.boolean(),
  rating: z.number().min(1).max(5).nullish(),
  review_count: z.int().nonnegative(),
});
export type VendorSummary = z.infer<typeof vendorSummarySchema>;

export const modelVersionSchema = z.string().min(1);
