// S6/S14: a tap on a form button the moment it appears must not be silently lost.
//
// KNOWN DEFECT on the iPhone profile (3 of 3 runs on 2026-10-25): tapping "Book" before the page
// has finished loading sends no request and books nothing, so the person has to tap again. The
// other browser profiles complete the booking. Recommended fix: render action buttons disabled until
// the page has hydrated (a small client <SubmitButton>), so an early tap is visibly not ready.
// When that is done this test starts passing on iPhone and Playwright will flag the stale
// test.fail() below, which should then be removed.
import { expect, test } from '@playwright/test';
import { psql, seedJourney, signIn, uniqueEmail } from './helpers';

test('tapping Book the moment it appears is not lost', async ({ page }, testInfo) => {
  test.fail(testInfo.project.name === 'iphone', 'KNOWN DEFECT (Major): early taps are ignored before hydration on the iPhone profile');
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
