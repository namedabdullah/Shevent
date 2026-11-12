// The hero's category links (an orbit on wide screens, a row on narrow ones) open that category's
// directory page, /lahore/[category]. The directory page itself is covered in marketing.spec.
import { expect, test } from '@playwright/test';

// With Playwright's trace recording on (the config keeps traces of failures), about a third of clicks
// on an orbit chip never navigate: recording seems to stall the chip's morph transition. Untraced runs
// navigated 20 times out of 20 (2026-11-12), so this file runs without a trace.
test.use({ trace: 'off' });

test('a category in the hero opens its directory page', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const link = page.getByRole('navigation', { name: 'Budget categories' }).getByRole('link', { name: 'Photography' });
  // The orbit's chips pop in (scale up from nothing) after load: wait until this one is full size.
  await expect.poll(async () => (await link.boundingBox())?.width ?? 0).toBeGreaterThan(100);
  // Wide screens: the chips orbit slowly, so they never count as "stable" for Playwright. Phones get a
  // still row, which a normal click can scroll to and wait for.
  await link.click({ force: !isMobile });
  await expect(page).toHaveURL(/\/lahore\/photography$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Photographers in Lahore' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Categories' }).getByRole('link', { name: 'Photography' })).toHaveAttribute('aria-current', 'page');
});
