// S10: widths 360, 390, 768, 1366 and 1920 px — no horizontal scroll and nothing wider than the screen.
// Layout does not depend on the browser engine, so this runs once, on Chromium.
import { expect, test, type Page } from '@playwright/test';
import { seedJourney, signIn, uniqueEmail } from './helpers';

const WIDTHS = [360, 390, 768, 1366, 1920];

async function expectNoOverflow(page: Page, label: string) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(scroll, `${label}: page is ${scroll}px wide in a ${inner}px window`).toBeLessThanOrEqual(inner);
}

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'layout is checked once, on Chromium');
});

test('public pages fit every width', async ({ page }) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/', '/sign-in', '/no-such-page']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNoOverflow(page, `${path} @${width}`);
    }
  }
});

test('signed-in pages fit every width', async ({ page }) => {
  test.setTimeout(240_000);
  const email = uniqueEmail('widths');
  await signIn(page, email, '/plans');
  const journey = seedJourney(email);
  const paths = [
    '/plans',
    '/plan/new',
    `/plans/${journey.planId}`,
    `/plans/${journey.planId}/catering`,
    `/plans/${journey.planId}/packages`,
    `/plans/${journey.planId}/feedback`,
    `/inquiries/${journey.quotedInquiryId}`,
    `/bookings/${journey.bookingId}`,
  ];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNoOverflow(page, `${path.replace(/[0-9a-f-]{36}/g, ':id')} @${width}`);
    }
  }
});
