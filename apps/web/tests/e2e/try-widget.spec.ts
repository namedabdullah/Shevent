// S6 Marketing → host journey (WEB_APP_PLAN §5.2): the landing page's "Try it" widget gives a
// #1 + #2 answer with no sign-up, and "See vendors for this plan" keeps the answers through sign-in.
import { expect, test } from '@playwright/test';
import { requestMagicLink, uniqueEmail } from './helpers';

/** A date about two months ahead, so the test never ages into the past. */
function futureDate(): string {
  return new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

test('the try widget shows a budget split without signing up', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: /try the budget planner/ }).click();
  await expect(page).toHaveURL(/#try$/);

  const widget = page.locator('#try');
  await widget.getByRole('button', { name: 'Show my budget split' }).click();
  await expect(widget.getByText('Choose the type of event.')).toBeVisible();
  await expect(widget.getByText('Enter a budget such as')).toBeVisible();

  await widget.getByLabel('Type of event').selectOption('wedding_mehndi');
  await widget.getByLabel('Number of guests').fill('300');
  await widget.getByLabel('Area in Lahore').selectOption('Gulberg');
  await widget.getByLabel('Date').fill(futureDate());
  await widget.getByLabel('Total budget').fill('25 lakh');
  await expect(widget.getByText("That's Rs 25 lakh.")).toBeVisible();
  await widget.getByRole('button', { name: 'Show my budget split' }).click();

  const result = widget.getByRole('region', { name: 'Your budget split' });
  await expect(result.getByRole('heading', { name: 'Your budget split' })).toBeFocused();
  await expect(result).toContainText('Mehndi / mayun / dholki · 300 guests · Gulberg · Rs 25 lakh');
  await expect(result).toContainText('Sample numbers');
  await expect(result.locator('tbody tr')).toHaveCount(6);
  // Catering gets 38% of the sample split: Rs 9.5 lakh of 25 lakh.
  await expect(result.getByRole('row', { name: /Catering/ })).toContainText('Rs 9.5 lakh');
  // Nothing was saved and nobody had to sign in.
  await expect(page).toHaveURL(/\/(#try)?$/);
  await expect(widget.getByText('Choose the type of event.')).toHaveCount(0);
});

test('"See vendors for this plan" keeps the answers through sign-in', async ({ page }) => {
  test.setTimeout(120_000);
  const date = futureDate();
  await page.goto('/#try');
  await page.waitForLoadState('networkidle');
  const widget = page.locator('#try');
  await widget.getByLabel('Type of event').selectOption('birthday');
  await widget.getByLabel('Number of guests').fill('80');
  await widget.getByLabel('Area in Lahore').selectOption('Johar Town');
  await widget.getByLabel('Date').fill(date);
  await widget.getByLabel('Total budget').fill('8 lakh');
  await widget.getByRole('button', { name: 'Show my budget split' }).click();
  await widget.getByRole('link', { name: 'See vendors for this plan' }).click();

  await expect(page).toHaveURL(/\/sign-in\?next=%2Fplan%2Fnew%3F/);
  await expect(page.getByRole('heading', { name: 'Sign in to Shevent' })).toBeVisible();
  const next = new URL(page.url()).searchParams.get('next')!;
  const link = await requestMagicLink(page, uniqueEmail('try-widget'), next);
  await page.goto(link);
  await page.waitForURL(/\/plan\/new\?/, { timeout: 45_000 });

  await expect(page.getByLabel('Type of event')).toHaveValue('birthday');
  await expect(page.getByLabel('Number of guests')).toHaveValue('80');
  await expect(page.getByLabel('Area in Lahore')).toHaveValue('Johar Town');
  await expect(page.getByLabel('Date')).toHaveValue(date);
  await expect(page.getByLabel('Total budget')).toHaveValue('8 lakh');
});
