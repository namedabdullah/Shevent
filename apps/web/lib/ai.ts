import { createApiClient, type ApiClient } from '@shevent/core/api';

/**
 * Model server client for Server Components and Server Actions. Talks to the FastAPI server
 * directly (the /api/ai proxy is for the browser). With NEXT_PUBLIC_API_FIXTURES=true it answers
 * from packages/core fixtures, which every page labels as sample data.
 */
export function getAi(): ApiClient {
  return createApiClient({
    baseUrl: process.env.MODEL_SERVER_URL ?? 'http://localhost:8000',
    fixtures: process.env.NEXT_PUBLIC_API_FIXTURES === 'true',
    fixtureDelayMs: 0,
  });
}
