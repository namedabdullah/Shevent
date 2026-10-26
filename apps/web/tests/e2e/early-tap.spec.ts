// S6/S14: a tap on a form button the moment it appears must not be silently lost.
//
// Before 2026-10-26 a tap on "Book" before the page had hydrated sent nothing on the iPhone profile.
// Action buttons are now <SubmitButton>s, disabled until hydration, so an early tap waits (or, for a
// person, the button visibly is not ready yet) instead of vanishing.
import { expect, test } from '@playwright/test';
import { psql, seedJourney, signIn, uniqueEmail } from './helpers';

test('tapping Book the moment it appears is not lost', async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail('early');
  await signIn(page, email, '/plans');
  const journey = seedJourney(email);

  await page.goto(`/inquiries/${journey.quotedInquiryId}`, { waitUntil: 'commit' });
  const book = page.getByRole('button', { name: /^Book for/ });
  await book.waitFor({ state: 'visible' });
  await book.click();

  await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}\?booked=1$/, { timeout: 15_000 });
  expect(psql(`select count(*) from public.bookings where inquiry_id = '${journey.quotedInquiryId}'`)).toBe('1');
});
