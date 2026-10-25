// S8: AI proxy, secrets in the client bundle, server-side validation, response headers.
import { expect, test } from '@playwright/test';

test.describe('AI proxy', () => {
  for (const path of ['/api/ai/docs', '/api/ai/openapi.json', '/api/ai/v2/x', '/api/ai/v1/..%2F..%2Fdocs', '/api/ai/v1/%2e%2e/docs', '/api/ai/v1/.hidden', '/api/ai']) {
    test(`${path} is not forwarded`, async ({ request }) => {
      const response = await request.get(path);
      expect([404, 405]).toContain(response.status());
    });
  }

  for (const method of ['put', 'delete', 'patch'] as const) {
    test(`${method.toUpperCase()} is not allowed`, async ({ request }) => {
      const response = await request[method]('/api/ai/v1/estimate', { data: {} });
      expect(response.status()).toBe(405);
    });
  }

  test('without a configured model server it answers 503 with a plain message', async ({ request }) => {
    const response = await request.post('/api/ai/v1/estimate', { data: {} });
    expect([503, 502, 504]).toContain(response.status());
    const body = await response.json();
    expect(typeof body.detail).toBe('string');
    expect(JSON.stringify(body)).not.toMatch(/localhost|127\.0\.0\.1|trycloudflare|https?:\/\//);
  });
});

test('no secret or server-only value reaches the browser', async ({ page, request, baseURL }) => {
  await page.goto('/');
  const html = await page.content();
  const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]!);
  expect(scripts.length).toBeGreaterThan(0);
  const bodies = [html];
  for (const src of scripts) bodies.push(await (await request.get(new URL(src, baseURL).href)).text());
  const joined = bodies.join('\n');
  for (const forbidden of ['sb_secret_', 'SERVICE_ROLE', 'service_role', 'MODEL_SERVER_URL', 'trycloudflare', 'SUPABASE_AUTH_EXTERNAL', 'BEGIN PRIVATE KEY']) {
    expect(joined, forbidden).not.toContain(forbidden);
  }
});

test('response headers', async ({ request }) => {
  const headers = (await request.get('/')).headers();
  expect(headers['x-content-type-options'], 'X-Content-Type-Options').toBe('nosniff');
  expect(headers['referrer-policy'], 'Referrer-Policy').toBeTruthy();
  expect(headers['x-frame-options'] ?? headers['content-security-policy'], 'frame protection').toBeTruthy();
});

test.describe('server-side validation (skipping the browser forms)', () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

  test('the database rejects bad leads sent straight to the API', async ({ request }) => {
    test.skip(!key, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY not set for the test run');
    const headers = { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' };
    const post = (data: object) => request.post(`${url}/rest/v1/leads`, { headers, data });
    expect((await post({ type: 'nonsense', contact: 'x@example.com' })).status()).toBe(400);
    expect((await post({ type: 'waitlist', contact: 'x' })).status()).toBe(400);
    expect((await post({ type: 'waitlist', contact: `${'a'.repeat(300)}@example.com` })).status()).toBe(400);
    expect((await post({ type: 'vendor_join', contact: 'x@example.com' })).status()).toBe(400);
    expect((await post({ type: 'waitlist', contact: 'x@example.com', created_at: '2000-01-01' })).status()).toBe(401);
    expect((await request.get(`${url}/rest/v1/leads?select=*`, { headers })).status()).toBe(401);
  });
});
