// Typed client for the FastAPI model server. The web app uses baseUrl "/api/ai" (the Next.js
// proxy); mobile uses the model server URL directly. With `fixtures: true` no request is made.

import type { z } from 'zod';
import {
  feedbackFixture,
  fixtureAssistantChat,
  fixtureEstimate,
  fixturePackages,
  fixtureQuoteCheck,
  fixtureRecommend,
  fixtureReviewInsights,
  portfolioCheckFixture,
} from '../fixtures';
import {
  assistantChatRequestSchema,
  assistantChatResponseSchema,
  estimateRequestSchema,
  estimateResponseSchema,
  feedbackRequestSchema,
  feedbackResponseSchema,
  packagesRequestSchema,
  packagesResponseSchema,
  portfolioCheckResponseSchema,
  quoteCheckRequestSchema,
  quoteCheckResponseSchema,
  recommendRequestSchema,
  recommendResponseSchema,
  reviewInsightsRequestSchema,
  reviewInsightsResponseSchema,
  type AssistantChatRequest,
  type AssistantChatResponse,
  type EstimateRequest,
  type EstimateResponse,
  type FeedbackRequest,
  type FeedbackResponse,
  type PackagesRequest,
  type PackagesResponse,
  type PortfolioCheckResponse,
  type QuoteCheckRequest,
  type QuoteCheckResponse,
  type RecommendRequest,
  type RecommendResponse,
  type ReviewInsightsResponse,
} from '../schemas';

export interface ApiClientOptions {
  baseUrl: string;
  /** Answer from packages/core/fixtures instead of calling the server. */
  fixtures?: boolean;
  /** Simulated latency for fixture answers, so loading states get exercised. */
  fixtureDelayMs?: number;
  fetch?: typeof fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function createApiClient(options: ApiClientOptions) {
  const fetchImpl = options.fetch ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  async function send<S extends z.ZodType>(path: string, body: BodyInit, headers: HeadersInit, schema: S, init?: RequestOptions): Promise<z.infer<S>> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { accept: 'application/json', ...headers },
      body,
      signal: init?.signal,
    });
    const data: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      throw new ApiError(`${path} failed with ${response.status}`, response.status, data);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw new ApiError(`${path} returned an unexpected response: ${parsed.error.message}`, response.status, data);
    }
    return parsed.data;
  }

  const post = <S extends z.ZodType>(path: string, body: unknown, schema: S, init?: RequestOptions) =>
    send(path, JSON.stringify(body), { 'content-type': 'application/json' }, schema, init);

  async function fixture<T>(answer: () => T, init?: RequestOptions): Promise<T> {
    await new Promise<void>((resolve, reject) => {
      if (init?.signal?.aborted) return reject(init.signal.reason);
      const timer = setTimeout(resolve, options.fixtureDelayMs ?? 400);
      init?.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(init.signal?.reason);
      });
    });
    return answer();
  }

  return {
    /** #1 budget split + #2 price ranges. */
    async estimate(request: EstimateRequest, init?: RequestOptions): Promise<EstimateResponse> {
      const valid = estimateRequestSchema.parse(request);
      if (options.fixtures) return fixture(() => fixtureEstimate(valid), init);
      return post('/v1/estimate', valid, estimateResponseSchema, init);
    },

    /** #3 ranked vendors for one category; sponsored results in their own list. */
    async recommend(request: RecommendRequest, init?: RequestOptions): Promise<RecommendResponse> {
      const valid = recommendRequestSchema.parse(request);
      if (options.fixtures) return fixture(() => fixtureRecommend(valid), init);
      return post('/v1/recommend', valid, recommendResponseSchema, init);
    },

    /** #4 cheapest / balanced / highest-quality bundles within budget. */
    async packages(request: PackagesRequest, init?: RequestOptions): Promise<PackagesResponse> {
      const valid = packagesRequestSchema.parse(request);
      if (options.fixtures) return fixture(() => fixturePackages(valid), init);
      return post('/v1/packages', valid, packagesResponseSchema, init);
    },

    /** #5 fairness label for a quote (host view and vendor preview). */
    async quoteCheck(request: QuoteCheckRequest, init?: RequestOptions): Promise<QuoteCheckResponse> {
      const valid = quoteCheckRequestSchema.parse(request);
      if (options.fixtures) return fixture(() => fixtureQuoteCheck(valid), init);
      return post('/v1/quote-check', valid, quoteCheckResponseSchema, init);
    },

    /** #6 review pros/cons for a vendor. */
    async reviewInsights(vendorId: string, init?: RequestOptions): Promise<ReviewInsightsResponse> {
      const valid = reviewInsightsRequestSchema.parse({ vendor_id: vendorId });
      if (options.fixtures) return fixture(() => fixtureReviewInsights(valid.vendor_id), init);
      return post('/v1/reviews/insights', valid, reviewInsightsResponseSchema, init);
    },

    /** #7 tags and duplicate check for one portfolio photo. */
    async portfolioCheck(vendorId: string, image: Blob, init?: RequestOptions): Promise<PortfolioCheckResponse> {
      if (options.fixtures) return fixture(() => portfolioCheckFixture, init);
      const form = new FormData();
      form.set('vendor_id', vendorId);
      form.set('image', image);
      // No content-type header: fetch sets the multipart boundary itself.
      return send('/v1/portfolio/check', form, {}, portfolioCheckResponseSchema, init);
    },

    /** Post-event actual spend and rating, for retraining. */
    async feedback(request: FeedbackRequest, init?: RequestOptions): Promise<FeedbackResponse> {
      const valid = feedbackRequestSchema.parse(request);
      if (options.fixtures) return fixture(() => feedbackFixture, init);
      return post('/v1/feedback', valid, feedbackResponseSchema, init);
    },

    /** #8 chat planner. On fallback_to_form, open the planner pre-filled with `extracted`. */
    async assistantChat(request: AssistantChatRequest, init?: RequestOptions): Promise<AssistantChatResponse> {
      const valid = assistantChatRequestSchema.parse(request);
      if (options.fixtures) return fixture(() => fixtureAssistantChat(valid), init);
      return post('/v1/assistant/chat', valid, assistantChatResponseSchema, init);
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
