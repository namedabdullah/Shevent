// S11: axe-core on every page built so far. Serious and critical violations fail the test.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { seedInquiry, seedJourney, seedListing, signIn, uniqueEmail, type Journey } from './helpers';

async function expectNoSeriousViolations(page: Page, name: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    serious.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`),
    name,
  ).toEqual([]);
}

test('public pages', async ({ page }) => {
  for (const path of ['/', '/sign-in', '/no-such-page']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectNoSeriousViolations(page, path);
  }
});

test('the try widget, empty and with an answer', async ({ page }) => {
  await page.goto('/#try');
  await page.waitForLoadState('networkidle');
  await expectEveryControlLabelled(page, '/ (try widget)');
  const widget = page.locator('#try');
  await widget.getByRole('button', { name: 'Show my budget split' }).click();
  await expectNoSeriousViolations(page, 'try widget errors');
  await widget.getByLabel('Type of event').selectOption('wedding_walima');
  await widget.getByLabel('Number of guests').fill('400');
  await widget.getByLabel('Area in Lahore').selectOption('DHA');
  await widget.getByLabel('Date').fill(new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10));
  await widget.getByLabel('Total budget').fill('40 lakh');
  await widget.getByRole('button', { name: 'Show my budget split' }).click();
  await expect(widget.getByRole('region', { name: 'Your budget split' })).toBeVisible();
  await expectNoSeriousViolations(page, 'try widget answer');
});

test('the assistant with a full answer', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, uniqueEmail('a11y-assistant'), '/assistant');
  await page.waitForLoadState('networkidle');
  await expectEveryControlLabelled(page, '/assistant');
  await page.getByLabel('Your message').fill('walima for 400 guests in DHA, 2 March 2027, budget 40 lakh');
  await page.getByLabel('Your message').press('Enter');
  await expect(page.getByRole('link', { name: 'Save as a plan' })).toBeVisible();
  await expectNoSeriousViolations(page, 'assistant answer');
});

test('signed-in pages', async ({ page }) => {
  test.setTimeout(240_000);
  const email = uniqueEmail('a11y');
  await signIn(page, email, '/plans');
  const journey: Journey = seedJourney(email);
  const paths = [
    '/plans',
    '/plan/new',
    `/plans/${journey.planId}`,
    `/plans/${journey.planId}/catering`,
    `/plans/${journey.planId}/packages`,
    `/plans/${journey.planId}/feedback`,
    `/inquiries/${journey.quotedInquiryId}`,
    `/bookings/${journey.bookingId}`,
    '/vendor/onboarding',
    '/assistant',
  ];
  await page.goto('/vendor/onboarding');
  await expectEveryControlLabelled(page, '/vendor/onboarding');
  for (const path of paths) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1:visible')).toBeVisible();
    await expectNoSeriousViolations(page, path.replace(journey.planId, ':plan').replace(journey.quotedInquiryId, ':inquiry').replace(journey.bookingId, ':booking'));
  }
});

test('vendor pages', async ({ page }) => {
  test.setTimeout(180_000);
  const email = uniqueEmail('a11y-vendor');
  await signIn(page, email, '/plans');
  // The account sends itself the inquiry: enough for the vendor pages to render with data.
  const { inquiryId } = seedInquiry(email, seedListing(email));
  for (const path of ['/vendor', '/vendor/inquiries', '/vendor/profile', `/vendor/inquiries/${inquiryId}`]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h1:visible')).toBeVisible();
    await expectNoSeriousViolations(page, path.replace(inquiryId, ':inquiry'));
    await expectEveryControlLabelled(page, path);
  }
  // With the live preview showing a fairness label.
  await page.locator('main:visible').getByLabel('Your price').fill('4000');
  await expect(page.locator('main:visible').getByText('Above the typical range')).toBeVisible({ timeout: 15_000 });
  await expectNoSeriousViolations(page, 'quote preview');
});

async function expectEveryControlLabelled(page: Page, name: string) {
  for (const control of await page.locator('main:visible input:not([type="hidden"]):not([aria-hidden="true"]), main:visible select, main:visible textarea').all()) {
    const labelled = await control.evaluate((el) => (el as HTMLInputElement).labels?.length ?? 0);
    const aria = (await control.getAttribute('aria-label')) ?? '';
    expect(labelled > 0 || aria !== '', `${name}: ${(await control.getAttribute('name')) ?? 'control'}`).toBe(true);
  }
}

test('every form control has a label and the chart has a table alternative', async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail('labels');
  await signIn(page, email, '/plans');
  const journey = seedJourney(email);

  await page.goto('/plan/new');
  await expectEveryControlLabelled(page, '/plan/new');

  await page.goto(`/plans/${journey.planId}`);
  await expect(page.locator('table caption')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toHaveCount(6);
  // Colour is never the only channel: each chart colour has a text label in the table and legend.
  await expect(page.locator('tbody th')).toHaveText(['Venue', 'Catering', 'Decor', 'DJ & Sound', 'Lighting', 'Photography']);
});

test('the planner works with the keyboard only', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Safari does not Tab to checkboxes/selects by default (OS setting), so it is checked manually');
  test.setTimeout(120_000);
  await signIn(page, uniqueEmail('keyboard'), '/plan/new');
  await expect(page.getByRole('heading', { name: 'Plan your event' })).toBeVisible();
  await page.waitForLoadState('networkidle'); // keys pressed before hydration are lost
  await page.getByLabel('Type of event').focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  await page.keyboard.type('120');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Date')).toBeFocused();
});

// Regression: a dark OS setting once turned the page background near-black under dark-grey text
// (contrast 1.9:1). The site is light-only, so dark-mode visitors must get the same cream page.
test.describe('with the OS set to dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('pages stay light and readable', async ({ page }) => {
    for (const path of ['/', '/sign-in']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      // Playwright's iPhone WebKit reports stale computed styles for <body> on the landing page
      // until something is painted, although a screenshot shows the cream page. So paint first.
      await page.screenshot();
      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(background, `${path} background`).toBe('rgb(251, 247, 241)');
      await expectNoSeriousViolations(page, `${path} (dark OS)`);
    }
  });
});
