// S14: double-clicking an action saves exactly one row.
import { expect, test } from '@playwright/test';
import { DEMO_VENDORS, psql, seedJourney, signIn, uniqueEmail } from './helpers';

test('double-clicking "Send inquiry" creates one inquiry', async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail('dbl-inquiry');
  await signIn(page, email, '/plans');
  const journey = seedJourney(email);
  psql(`delete from public.inquiries where plan_id = '${journey.planId}'`); // start without any inquiry

  await page.goto(`/plans/${journey.planId}/catering`);
  await page.waitForLoadState('networkidle'); // taps before the page is ready are covered by early-tap.spec.ts
  await page.locator('section[aria-labelledby="matches-heading"]:visible article').first().getByRole('button', { name: 'Send inquiry' }).dblclick();
  await expect(page).toHaveURL(/\/inquiries\/[0-9a-f-]{36}/, { timeout: 30_000 });
  expect(psql(`select count(*) from public.inquiries where plan_id = '${journey.planId}'`)).toBe('1');
});

test('double-clicking "Book" creates one booking', async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail('dbl-book');
  await signIn(page, email, '/plans');
  const journey = seedJourney(email);

  await page.goto(`/inquiries/${journey.quotedInquiryId}`);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /^Book for/ }).dblclick();
  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}/, { timeout: 30_000 });
  expect(psql(`select count(*) from public.bookings where inquiry_id = '${journey.quotedInquiryId}'`)).toBe('1');
  expect(psql(`select count(*) from public.bookings where vendor_id = '${DEMO_VENDORS.caterer}' and host_id = '${journey.hostId}'`)).toBe('1');
});
