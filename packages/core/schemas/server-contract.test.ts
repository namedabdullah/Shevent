// The model server's saved sample requests and answers (server/tests/contract/, written by its tests from the real
// endpoints) must pass these zod schemas, so the pydantic models in server/app/schemas.py can't drift from them.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  assistantChatRequestSchema,
  assistantChatResponseSchema,
  estimateRequestSchema,
  estimateResponseSchema,
  feedbackRequestSchema,
  feedbackResponseSchema,
  packagesRequestSchema,
  packagesResponseSchema,
  portfolioCheckRequestSchema,
  portfolioCheckResponseSchema,
  quoteCheckRequestSchema,
  quoteCheckResponseSchema,
  recommendRequestSchema,
  recommendResponseSchema,
  reviewInsightsRequestSchema,
  reviewInsightsResponseSchema,
} from './index';

const ENDPOINTS: Record<string, [z.ZodType, z.ZodType]> = {
  estimate: [estimateRequestSchema, estimateResponseSchema],
  recommend: [recommendRequestSchema, recommendResponseSchema],
  packages: [packagesRequestSchema, packagesResponseSchema],
  'quote-check': [quoteCheckRequestSchema, quoteCheckResponseSchema],
  feedback: [feedbackRequestSchema, feedbackResponseSchema],
  'assistant-chat': [assistantChatRequestSchema, assistantChatResponseSchema],
  'reviews-insights': [reviewInsightsRequestSchema, reviewInsightsResponseSchema],
  // A form upload: the sample's request is its text field (vendor_id); the photo isn't saved.
  'portfolio-check': [portfolioCheckRequestSchema, portfolioCheckResponseSchema],
};

describe('model server contract samples', () => {
  it.each(Object.entries(ENDPOINTS))('%s request and answer match the schemas', (name, [requestSchema, responseSchema]) => {
    const url = new URL(`../../../server/tests/contract/${name}.json`, import.meta.url);
    const sample = JSON.parse(readFileSync(fileURLToPath(url), 'utf8')) as { request: unknown; response: unknown };
    const request = requestSchema.safeParse(sample.request);
    expect(request.error?.issues ?? []).toEqual([]);
    const response = responseSchema.safeParse(sample.response);
    expect(response.error?.issues ?? []).toEqual([]);
  });
});
