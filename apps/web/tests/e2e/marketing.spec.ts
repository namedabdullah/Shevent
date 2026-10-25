// S6 Marketing journey + S12 basics: public pages, 404, robots, sitemap, metadata.
import { expect, test } from '@playwright/test';

test('landing page says what Shevent does and has no NETSOL text', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('real price ranges');
  await expect(page.getByRole('button', { name: 'Join the waitlist' })).toBeVisible();
  await expect(page.locator('footer')).toContainText('Event planning for Lahore');
  await expect(page.locator('body')).not.toContainText('NETSOL');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).not.toHaveAttribute('dir', 'rtl');
});

test('header links work', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('heading', { name: 'Sign in to Shevent' })).toBeVisible();
  await page.getByRole('link', { name: 'Shevent', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('unknown URLs show the not-found page with a real 404', async ({ page, request }) => {
  expect((await request.get('/no-such-page')).status()).toBe(404);
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to the home page' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('the Urdu pages were removed', async ({ request }) => {
  for (const path of ['/ur', '/ur/sign-in']) expect((await request.get(path)).status(), path).toBe(404);
});

test('metadata: title, description, canonical and social tags', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Shevent/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{50,}/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https?:\/\/[^/]+\/?$/);
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
  await expect(page.locator('meta[property="og:description"]')).toHaveCount(1);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveCount(1);
});

test('sign-in page is not indexed', async ({ page }) => {
  await page.goto('/sign-in');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});

test('robots.txt blocks the signed-in areas but not public vendor profiles', async ({ request }) => {
  const body = await (await request.get('/robots.txt')).text();
  for (const path of ['/api/', '/plan$', '/plan/', '/plans$', '/plans/', '/inquiries/', '/bookings/', '/assistant$', '/vendor$', '/vendor/']) {
    expect(body, path).toContain(`Disallow: ${path}`);
  }
  expect(body).not.toMatch(/Disallow: \/vendors/);
  expect(body).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/);
});

test('sitemap lists public pages only', async ({ request }) => {
  const response = await request.get('/sitemap.xml');
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain('<loc>');
  for (const path of ['/plans', '/plan/', '/vendor/', '/inquiries', '/bookings', '/p/']) expect(body, path).not.toContain(path);
});
