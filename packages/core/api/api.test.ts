import { describe, expect, it, vi } from 'vitest';
import {
  estimateRequestFixture,
  estimateResponseFixture,
  fixtureEstimate,
  fixtureRecommend,
  isFixtureResponse,
  portfolioCheckFixture,
} from '../fixtures';
import { estimateResponseSchema } from '../schemas';
import { ApiError, createApiClient } from './index';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('createApiClient', () => {
  it('posts to /v1/estimate under the base URL and validates the answer', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(estimateResponseFixture));
    const api = createApiClient({ baseUrl: '/api/ai/', fetch: fetchMock });

    await expect(api.estimate(estimateRequestFixture)).resolves.toEqual(estimateResponseFixture);
    expect(fetchMock).toHaveBeenCalledWith('/api/ai/v1/estimate', expect.objectContaining({ method: 'POST' }));
  });

  it('throws ApiError on HTTP errors and on responses that break the contract', async () => {
    const failing = createApiClient({ baseUrl: '', fetch: async () => jsonResponse({ detail: 'down' }, 503) });
    await expect(failing.estimate(estimateRequestFixture)).rejects.toMatchObject({ name: 'ApiError', status: 503 });

    const drifted = createApiClient({ baseUrl: '', fetch: async () => jsonResponse({ allocation: {} }) });
    await expect(drifted.estimate(estimateRequestFixture)).rejects.toBeInstanceOf(ApiError);
  });

  it('rejects invalid requests before calling the server', async () => {
    const fetchMock = vi.fn();
    const api = createApiClient({ baseUrl: '', fetch: fetchMock });
    await expect(api.estimate({ ...estimateRequestFixture, guest_count: 0 })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads portfolio photos as multipart without forcing a content type', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse(portfolioCheckFixture));
    const api = createApiClient({ baseUrl: '/api/ai', fetch: fetchMock });
    await api.portfolioCheck('vendor-1', new Blob(['jpeg bytes'], { type: 'image/jpeg' }));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/ai/v1/portfolio/check');
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get('vendor_id')).toBe('vendor-1');
    expect(new Headers(init?.headers).has('content-type')).toBe(false);
  });

  it('validates every endpoint against its contract', async () => {
    const recommend = fixtureRecommend({ plan: estimateRequestFixture, category: 'decor', budget_pkr: 425_000 });
    const api = createApiClient({ baseUrl: '', fetch: async () => jsonResponse(recommend) });
    await expect(api.recommend({ plan: estimateRequestFixture, category: 'decor', budget_pkr: 425_000 })).resolves.toEqual(recommend);
    // A recommend payload is not a valid packages answer.
    await expect(api.packages({ plan: estimateRequestFixture, categories: ['decor'] })).rejects.toBeInstanceOf(ApiError);
  });

  it('answers from fixtures without fetching', async () => {
    const fetchMock = vi.fn();
    const api = createApiClient({ baseUrl: '', fixtures: true, fixtureDelayMs: 0, fetch: fetchMock });
    const result = await api.estimate(estimateRequestFixture);
    expect(isFixtureResponse(result)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('fixtureEstimate', () => {
  it('scales the fixture to the requested budget and stays within the contract', () => {
    const result = fixtureEstimate({ ...estimateRequestFixture, total_budget_pkr: 1_000_000 });
    expect(estimateResponseSchema.safeParse(result).success).toBe(true);
    expect(result.allocation.venue.pkr).toBe(270_000);
    expect(result.allocation.venue.range).toEqual([234_000, 316_000]);
    expect(Object.keys(result.allocation)).toContain('photography');
    expect(Object.values(result.allocation).reduce((sum, item) => sum + item.pkr, 0)).toBe(1_000_000);
  });
});
