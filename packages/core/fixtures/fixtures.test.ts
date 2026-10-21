import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../enums';
import {
  assistantChatResponseSchema,
  estimateRequestSchema,
  estimateResponseSchema,
  packagesResponseSchema,
  portfolioCheckResponseSchema,
  quoteCheckResponseSchema,
  recommendResponseSchema,
  reviewInsightsResponseSchema,
  vendorSummarySchema,
  type QuoteCheckRequest,
} from '../schemas';
import {
  estimateRequestFixture,
  fixtureAssistantChat,
  fixtureEstimate,
  fixturePackages,
  fixtureQuoteCheck,
  fixtureRecommend,
  fixtureReviewInsights,
  fixtureVendors,
  isFixtureResponse,
  portfolioCheckFixture,
} from './index';

const plan = estimateRequestFixture;

describe('every fixture follows its contract', () => {
  it('demo vendors', () => {
    for (const vendor of fixtureVendors) expect(vendorSummarySchema.safeParse(vendor).success).toBe(true);
    expect(new Set(fixtureVendors.map((v) => v.vendor_id)).size).toBe(fixtureVendors.length);
    expect(fixtureVendors.every((v) => v.name.startsWith('Demo '))).toBe(true);
  });

  it('estimate', () => {
    expect(estimateRequestSchema.safeParse(plan).success).toBe(true);
    expect(estimateResponseSchema.safeParse(fixtureEstimate(plan)).success).toBe(true);
  });

  it.each(CATEGORIES)('recommend: %s', (category) => {
    const budget = fixtureEstimate(plan).allocation[category].pkr;
    const response = fixtureRecommend({ plan, category, budget_pkr: budget });
    expect(recommendResponseSchema.safeParse(response).success).toBe(true);
    expect(response.matches.length).toBeGreaterThan(0);
    expect(response.matches.every((m) => m.category === category)).toBe(true);
    expect(response.matches.map((m) => m.score)).toEqual([...response.matches.map((m) => m.score)].sort((a, b) => b - a));
  });

  it('recommend keeps sponsored vendors out of the organic list', () => {
    const response = fixtureRecommend({ plan, category: 'venue', budget_pkr: 750_000 });
    expect(response.sponsored.map((m) => m.slug)).toEqual(['demo-rooftop-dha']);
    expect(response.matches.some((m) => m.slug === 'demo-rooftop-dha')).toBe(false);
  });

  it('packages stay within budget for every kind', () => {
    const response = fixturePackages({ plan, categories: [...CATEGORIES] });
    expect(packagesResponseSchema.safeParse(response).success).toBe(true);
    expect(response.packages.map((p) => p.kind)).toEqual(['cheapest', 'balanced', 'highest_quality']);
    expect(response.packages[0]!.total_pkr).toBeLessThan(response.packages[2]!.total_pkr);
  });

  it('review insights, portfolio check and assistant', () => {
    expect(reviewInsightsResponseSchema.safeParse(fixtureReviewInsights('x')).success).toBe(true);
    expect(portfolioCheckResponseSchema.safeParse(portfolioCheckFixture).success).toBe(true);
    const chat = fixtureAssistantChat({ messages: [{ role: 'user', content: 'mehndi 300 log gulberg 25 lakh' }] });
    expect(assistantChatResponseSchema.safeParse(chat).success).toBe(true);
    expect(isFixtureResponse(chat)).toBe(true);
  });
});

describe('fixtureQuoteCheck', () => {
  // Catering range for the README example: Rs 840,000–1,100,000 → Rs 2,800–3,667 per head for 300 guests.
  const quote = (quoted_pkr: number, inclusions: string[] = []): QuoteCheckRequest => ({
    plan,
    category: 'catering',
    quoted_pkr,
    unit: 'per_head',
    inclusions,
  });

  it('converts the range to the quote unit', () => {
    expect(fixtureQuoteCheck(quote(3000)).typical_range).toEqual([2800, 3667]);
  });

  it.each([
    [3000, 'green', null],
    [4200, 'yellow', 15],
    [5000, 'red', 36],
  ] as const)('Rs %d per head → %s', (price, level, percent) => {
    const result = fixtureQuoteCheck(quote(price));
    expect(quoteCheckResponseSchema.safeParse(result).success).toBe(true);
    expect(result.level).toBe(level);
    expect(result.percent_above_high).toBe(percent);
  });

  it('asks only about inclusions the quote does not mention', () => {
    expect(fixtureQuoteCheck(quote(3000)).ask_about).toEqual(['Serving staff', 'Service tax', 'Transport']);
    expect(fixtureQuoteCheck(quote(3000, ['Serving staff', 'Tax included'])).ask_about).toEqual(['Transport']);
  });
});
