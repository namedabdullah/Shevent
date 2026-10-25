// S6 Host journey + S7 honesty rules, on fixtures: plan → split → matches → packages → inquiry and
// live chat → quote with fairness label → simulated booking → completed → feedback.
import { expect, test } from '@playwright/test';
import { ACCUSATION_WORDS, psql, signIn, uniqueEmail } from './helpers';

const RANGE = /Rs [\d.,]+(?: (?:lakh|crore))?(?: ?[–-] ?| – )[\d.,]+ ?(?:lakh|crore)?/;

test('host plans an event, chats with a vendor, books and gives feedback', async ({ page }) => {
  test.setTimeout(240_000);
  const email = uniqueEmail('flow');
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  const seenText: string[] = [];
  const remember = async () => seenText.push(await page.locator('main:visible').innerText());

  await test.step('sign in and open the planner', async () => {
    await signIn(page, email, '/plan/new');
    await expect(page.getByRole('heading', { name: 'Plan your event' })).toBeVisible();
  });

  await test.step('bad input shows messages next to the fields', async () => {
    await page.getByRole('button', { name: 'Get my budget split' }).click();
    for (const message of ['Choose the type of event.', 'Enter the number of guests (10 to 5,000).', 'Choose a date from today onwards.', 'Choose the area.']) {
      await expect(page.getByText(message)).toBeVisible();
    }
    await page.getByLabel('Type of event').selectOption('wedding_mehndi');
    await page.getByLabel('Number of guests').fill('300');
    await page.getByLabel('Date').fill('2026-12-19');
    await page.getByLabel('Area in Lahore').selectOption('Gulberg');
    await page.getByLabel('Total budget').fill('lots of money');
    await page.getByRole('button', { name: 'Get my budget split' }).click();
    await expect(page.getByText('Enter a budget such as 25 lakh, 1 crore or 850000.')).toBeVisible();
    await expect(page.getByLabel('Number of guests')).toHaveValue('300'); // typed values survive an error
  });

  let planUrl = '';
  await test.step('a valid plan shows the budget split with ranges and labels', async () => {
    await page.getByLabel('Type of venue').selectOption('marquee');
    await page.getByLabel('Total budget').fill('25 lakh');
    await expect(page.getByText("That's Rs 25 lakh.")).toBeVisible();
    await page.getByLabel('Decor is a priority').check();
    await page.getByRole('button', { name: 'Get my budget split' }).click();
    await page.waitForURL(/\/plans\/[0-9a-f-]{36}\?created=1$/, { timeout: 45_000 });
    planUrl = page.url().replace('?created=1', '');

    await expect(page.getByRole('heading', { name: 'Mehndi / mayun / dholki in Gulberg' })).toBeVisible();
    // S7: sample-data label on fixtures, AI-estimate label, and a range on every category row.
    await expect(page.getByText('Sample numbers for illustration, not market prices')).toBeVisible();
    await expect(page.getByText('AI estimate, not a vendor quote').first()).toBeVisible();
    const priceCells = page.locator('tbody tr td:last-child');
    await expect(priceCells).toHaveCount(5);
    for (const cell of await priceCells.all()) expect(await cell.innerText()).toMatch(RANGE);
    await expect(page.locator('[role="group"][aria-label="Your budget split"] > div')).toHaveCount(5);
    await remember();
  });

  await test.step('matches: ranked list with reasons; sponsored vendors in their own labelled block', async () => {
    await page.getByRole('link', { name: 'Catering' }).click();
    await expect(page.getByRole('heading', { name: 'Best matches' })).toBeVisible();
    const organic = page.locator('section[aria-labelledby="matches-heading"]:visible');
    const sponsored = page.locator('section[aria-labelledby="sponsored-heading"]:visible');
    await expect(sponsored.getByRole('heading', { name: 'Sponsored' })).toBeVisible();
    await expect(sponsored.getByText('Demo BBQ Nights Wapda Town')).toBeVisible();
    await expect(organic.getByText('Demo BBQ Nights Wapda Town')).toHaveCount(0);
    for (const card of await organic.locator('article').all()) {
      const text = await card.innerText();
      expect(text).toContain('AI estimate, not a vendor quote');
      expect(text).toMatch(RANGE);
      expect(text).not.toContain('Sponsored');
    }
    for (const card of await sponsored.locator('article').all()) expect(await card.innerText()).toContain('Sponsored');
    await remember();
  });

  let inquiryUrl = '';
  await test.step('send an inquiry and chat; the vendor reply arrives live', async () => {
    await page.locator('section[aria-labelledby="matches-heading"] article').first().getByRole('button', { name: 'Send inquiry' }).click();
    await page.waitForURL(/\/inquiries\/[0-9a-f-]{36}\?sent=1$/, { timeout: 30_000 });
    inquiryUrl = page.url().replace('?sent=1', '');
    const inquiryId = inquiryUrl.split('/').pop()!;

    const chat = page.locator('ol[aria-live="polite"]:visible');
    await page.getByLabel('Message').fill('Salam, is 19 December free?');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(chat.getByText('Salam, is 19 December free?')).toBeVisible();
    expect(psql(`select count(*) from public.messages where inquiry_id = '${inquiryId}'`)).toBe('1');

    // A message containing markup is shown as text.
    await page.getByLabel('Message').fill('<img src=x onerror=alert(1)> <script>alert(2)</script>');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(chat.getByText('<script>alert(2)</script>', { exact: false })).toBeVisible();
    expect(dialogs).toEqual([]);

    // The vendor answers (inserted as the vendor's account would): it must appear without a reload.
    const vendorAccount = psql(`insert into auth.users (id, email) values (gen_random_uuid(), 'vendor-${Date.now()}@example.com') returning id`).split('\n')[0]!;
    psql(`insert into public.messages (inquiry_id, sender_id, body) values ('${inquiryId}', '${vendorAccount}', 'Yes, we are free that evening.')`);
    await expect(chat.getByText('Yes, we are free that evening.')).toBeVisible({ timeout: 15_000 });

    // The vendor sends a quote.
    psql(`insert into public.quotes (inquiry_id, amount_pkr, unit, total_pkr, inclusions) values ('${inquiryId}', 3000, 'per_head', 900000, array['Serving staff'])`);
  });

  await test.step('the quote shows the fairness label as text with guidance wording, then book', async () => {
    await page.reload();
    await page.waitForLoadState('networkidle'); // people don't tap before the page is ready; see early-tap.spec.ts
    const label = page.getByText('Within the typical range');
    await expect(label).toBeVisible();
    await expect(page.getByText('Ask the vendor about:')).toBeVisible();
    await expect(page.getByText('Typical for this event: Rs 2,800–3,667 per head')).toBeVisible();
    await expect(page.getByText('AI estimate, not a vendor quote').first()).toBeVisible();
    await expect(page.getByText('Payment is simulated: no money is charged.')).toBeVisible();
    await remember();

    await page.getByRole('button', { name: /^Book for Rs 900,000$/ }).click();
    await page.waitForURL(/\/bookings\/[0-9a-f-]{36}\?booked=1$/, { timeout: 30_000 });
    await expect(page.getByText('Simulated: no money was charged')).toBeVisible();
    await expect(page.locator('main:visible dd', { hasText: 'Rs 900,000' })).toBeVisible();
    await remember();
  });

  await test.step('mark completed and send feedback', async () => {
    await page.getByRole('button', { name: 'Mark the event as completed' }).click();
    await page.getByRole('link', { name: 'Tell us how it went' }).click();
    await expect(page).toHaveURL(`${planUrl}/feedback`);
    await page.getByRole('button', { name: 'Send feedback' }).click();
    await expect(page.getByText('Choose a rating.')).toBeVisible();
    await page.getByLabel('Catering').fill('9.5 lakh');
    await page.getByLabel('How many guests came?').fill('280');
    await page.locator('label').filter({ has: page.locator('input[name="rating"][value="4"]') }).click();
    await page.getByRole('button', { name: 'Send feedback' }).click();
    await expect(page).toHaveURL(`${planUrl}?feedback=1`, { timeout: 30_000 });
    await expect(page.getByText('Thank you. Your feedback helps')).toBeVisible();
    const planId = planUrl.split('/').pop();
    expect(psql(`select actual_spend_pkr->>'catering' || '/' || guest_count_actual || '/' || rating from public.plan_feedback where plan_id = '${planId}'`)).toBe('950000/280/4');
  });

  await test.step('three packages within budget', async () => {
    await page.goto(`${planUrl}/packages`);
    await expect(page.getByRole('heading', { name: 'Vendor packages' })).toBeVisible();
    const cards = page.locator('main:visible article');
    await expect(cards).toHaveCount(3);
    for (const card of await cards.all()) {
      const text = await card.innerText();
      const total = Number(/Rs ([\d,]+)\n?\s*\d+% of your budget/.exec(text)?.[1]?.replace(/,/g, '') ?? Number.NaN);
      expect(total, text).toBeLessThanOrEqual(2_500_000);
      expect((text.match(/Demo /g) ?? []).length, 'one vendor per category').toBe(5);
    }
    await remember();
  });

  await test.step('honesty: no accusations anywhere; sample label still on', async () => {
    for (const text of seenText) expect(text).not.toMatch(ACCUSATION_WORDS);
    expect(dialogs).toEqual([]);
  });
});

test('a failed estimate keeps the plan and offers a retry', async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail('noestimate');
  await signIn(page, email, '/plans');
  const { seedJourney } = await import('./helpers');
  const journey = seedJourney(email);
  psql(`update public.plans set estimate = null where id = '${journey.planId}'`);
  await page.goto(`/plans/${journey.planId}`);
  await expect(page.getByText("We couldn't work out your budget split yet")).toBeVisible();
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Your budget split' })).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(5);
});

test('the planner can be pre-filled from the URL (for the landing-page widget)', async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, uniqueEmail('prefill'), '/plans');
  await page.goto('/plan/new?event_type=birthday&guests=60&area=Johar+Town&date=2026-12-05&budget=6+lakh&venue_type=rooftop');
  await expect(page.getByLabel('Type of event')).toHaveValue('birthday');
  await expect(page.getByLabel('Number of guests')).toHaveValue('60');
  await expect(page.getByLabel('Area in Lahore')).toHaveValue('Johar Town');
  await expect(page.getByLabel('Total budget')).toHaveValue('6 lakh');
  await expect(page.getByText("That's Rs 6 lakh.")).toBeVisible();
});
