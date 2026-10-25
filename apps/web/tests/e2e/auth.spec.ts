// S6 Auth journey + S8 access control and open-redirect checks.
import { expect, test } from '@playwright/test';
import { requestMagicLink, seedJourney, signIn, uniqueEmail } from './helpers';

const PROTECTED = ['/plan', '/plan/new', '/plans', '/plans/1', '/inquiries/1', '/bookings/1', '/assistant', '/vendor', '/vendor/onboarding'];

test.describe('signed out', () => {
  for (const path of PROTECTED) {
    test(`${path} sends you to sign-in and remembers where you were going`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path).replace(/%/g, '%')}$`));
    });
  }

  test('public pages stay public', async ({ page, request }) => {
    for (const path of ['/', '/sign-in', '/robots.txt', '/sitemap.xml']) expect((await request.get(path)).status(), path).toBe(200);
    await page.goto('/vendors/anything');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('an invalid email is rejected and kept in the box', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email address').fill('not-an-email');
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    await expect(page.getByLabel('Email address')).toHaveValue('not-an-email');
  });
});

test('magic-link sign-in lands where you were going, then sign-out locks the pages again', async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail('auth');
  await page.goto('/plans');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fplans$/);
  const link = await requestMagicLink(page, email, '/plans');
  await page.goto(link);
  await expect(page).toHaveURL(/\/plans$/);
  await expect(page.getByRole('heading', { name: 'My plans' })).toBeVisible();
  // The header shows the signed-in email only from 640 px up (it is hidden on phones to save room).
  if ((page.viewportSize()?.width ?? 0) >= 640) await expect(page.getByText(email)).toBeVisible();
  else await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await expect(page.getByText("You haven't made a plan yet")).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/plans');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fplans$/);
});

test('a used magic link cannot sign in again and says so', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail('reuse');
  const link = await requestMagicLink(page, email, '/plans');
  await page.goto(link);
  await expect(page).toHaveURL(/\/plans$/);

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await otherPage.goto(new URL(link).href);
  await expect(otherPage).toHaveURL(/\/sign-in\?error=link/);
  await expect(otherPage.getByText('expired or was already used')).toBeVisible();
  await other.close();
});

test('a host cannot open the vendor dashboard and can become a vendor', async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail('host-vendor');
  await signIn(page, email, '/plans');
  await page.goto('/vendor');
  await expect(page).toHaveURL(/\/vendor\/onboarding$/);
  await expect(page.getByRole('heading', { name: 'List your business on Shevent' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue as a vendor' }).click();
  await expect(page).toHaveURL(/\/vendor$/);
  await expect(page.getByRole('heading', { name: 'Vendor dashboard' })).toBeVisible();
});

test.describe('open redirects', () => {
  const hostile = ['//evil.example', 'https://evil.example', '/\\evil.example', 'http://evil.example/plans', 'javascript:alert(1)'];

  for (const next of hostile) {
    test(`callback with next=${next} never leaves the site`, async ({ request, baseURL }) => {
      const response = await request.get(`/api/auth/callback?code=bogus&next=${encodeURIComponent(next)}`, { maxRedirects: 0 });
      expect([302, 303, 307, 308]).toContain(response.status());
      const location = new URL(response.headers()['location']!, baseURL);
      expect(location.origin).toBe(new URL(baseURL!).origin);
    });
  }

  test('a hostile next on the sign-in page is ignored after signing in', async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail('redirect');
    await page.goto('/sign-in?next=//evil.example');
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
    await expect(page.getByRole('status')).toBeVisible();
    const { MAILPIT } = await import('./helpers');
    let link = '';
    for (let i = 0; i < 40 && !link; i++) {
      const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
      if (list.messages?.[0]) {
        const message = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json();
        link = (/https?:\/\/[^\s"<>]+verify[^\s"<>]+/.exec(message.Text ?? message.HTML)?.[0] ?? '').replace(/&amp;/g, '&');
      }
      if (!link) await page.waitForTimeout(500);
    }
    await page.goto(link);
    await page.waitForURL(`${baseURL}/plans`, { timeout: 45_000 });
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
  });
});

test.describe("another host's data", () => {
  test('is never shown to someone else', async ({ browser }) => {
    test.setTimeout(180_000);
    const owner = await browser.newContext();
    const ownerPage = await owner.newPage();
    const ownerEmail = uniqueEmail('owner');
    await signIn(ownerPage, ownerEmail, '/plans');
    const journey = seedJourney(ownerEmail);

    const intruder = await browser.newContext();
    const intruderPage = await intruder.newPage();
    await signIn(intruderPage, uniqueEmail('intruder'), '/plans');

    const urls = [
      `/plans/${journey.planId}`,
      `/plans/${journey.planId}/catering`,
      `/plans/${journey.planId}/packages`,
      `/plans/${journey.planId}/feedback`,
      `/inquiries/${journey.quotedInquiryId}`,
      `/bookings/${journey.bookingId}`,
    ];
    for (const url of urls) {
      await intruderPage.goto(url);
      await expect(intruderPage.getByRole('heading', { name: 'Page not found' }), url).toBeVisible();
      const text = await intruderPage.locator('body').innerText();
      expect(text, url).not.toContain('Mehndi');
      expect(text, url).not.toContain('Rs 25 lakh');
      expect(text, url).not.toContain('900,000');
    }

    // The owner still sees everything.
    await ownerPage.goto(`/plans/${journey.planId}`);
    await expect(ownerPage.getByRole('heading', { name: 'Mehndi / mayun / dholki in Gulberg' })).toBeVisible();
    await owner.close();
    await intruder.close();
  });
});
