import { createApiClient } from '@shevent/core/api';

/**
 * Model server client for Client Components. Calls go through the /api/ai proxy, or are answered
 * from packages/core fixtures while NEXT_PUBLIC_API_FIXTURES=true.
 */
export const api = createApiClient({
  baseUrl: '/api/ai',
  fixtures: process.env.NEXT_PUBLIC_API_FIXTURES === 'true',
});
