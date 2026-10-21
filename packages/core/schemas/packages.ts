// POST /v1/packages (#4 Package Builder): up to three vendor bundles that fit the budget.

import { z } from 'zod';
import { CATEGORIES } from '../enums';
import { modelVersionSchema, vendorSummarySchema } from './common';
import { estimateRequestSchema } from './estimate';

export const PACKAGE_KINDS = ['cheapest', 'balanced', 'highest_quality'] as const;
export type PackageKind = (typeof PACKAGE_KINDS)[number];

export const PACKAGE_KIND_LABELS: Record<PackageKind, string> = {
  cheapest: 'Cheapest',
  balanced: 'Balanced',
  highest_quality: 'Highest quality',
};

export const packagesRequestSchema = z.object({
  plan: estimateRequestSchema,
  categories: z
    .array(z.enum(CATEGORIES))
    .min(1)
    .refine((categories) => new Set(categories).size === categories.length, { message: 'categories must be unique' }),
});
export type PackagesRequest = z.infer<typeof packagesRequestSchema>;

export const packageItemSchema = z.object({
  vendor: vendorSummarySchema,
  price_pkr: z.number().nonnegative(),
  /** True when the vendor has no listed price and #2 filled it in. */
  price_is_estimate: z.boolean(),
  score: z.number().min(0).max(1),
});

export const packageSchema = z
  .object({
    kind: z.enum(PACKAGE_KINDS),
    total_pkr: z.number().nonnegative(),
    items: z.array(packageItemSchema).min(1),
  })
  .refine((pkg) => Math.abs(pkg.items.reduce((sum, item) => sum + item.price_pkr, 0) - pkg.total_pkr) < 1, {
    message: 'total_pkr must equal the sum of item prices',
  });
export type Package = z.infer<typeof packageSchema>;

export const packagesResponseSchema = z
  .object({
    budget_pkr: z.number().nonnegative(),
    packages: z.array(packageSchema).max(3),
    model_version: modelVersionSchema,
  })
  // Phase 3 exit gate: every package #4 returns is within budget.
  .refine((response) => response.packages.every((pkg) => pkg.total_pkr <= response.budget_pkr), {
    message: 'every package must be within budget',
  });
export type PackagesResponse = z.infer<typeof packagesResponseSchema>;
