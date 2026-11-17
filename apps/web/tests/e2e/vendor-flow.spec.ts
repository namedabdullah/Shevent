// S6 Vendor journey + the two-sided demo (WEB_APP_PLAN §9 Phase 3 gate): a vendor onboards, gets an
// inquiry, sends a quote with a live fairness preview, the host sees the label live and books.
// S7 honesty: the vendor never sees the host's budget, and the preview uses guidance wording.
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { ACCUSATION_WORDS, psql, seedInquiry, seedJourney, seedListing, signIn, uniqueEmail, userId } from './helpers';

const BUDGET = /25 lakh|2,500,000|2500000/;

const main = (page: Page) => page.locator('main:visible');

// A 1x1 PNG for the portfolio check.
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('a vendor onboards, quotes with a live preview, and the host books the quote', async ({ browser }) => {
  test.setTimeout(240_000);
  const vendorEmail = uniqueEmail('vendor');
  const hostEmail = uniqueEmail('vendor-host');
  // Not Date.now(): 13 digits in a row count as a phone number, which listings refuse.
  const businessName = `E2E Caterers ${randomUUID().slice(0, 8)}`;

  // The vendor lists their business.
  const vendorContext = await browser.newContext();
  const vendor = await vendorContext.newPage();
  await signIn(vendor, vendorEmail, '/vendor/onboarding');
  await expect(vendor.getByRole('heading', { name: 'List your business on Shevent' })).toBeVisible();
  await vendor.getByLabel('Business name').fill(businessName);
  await vendor.getByLabel('What do you provide?').selectOption('catering');
  await vendor.getByLabel('Where are you based?').selectOption('Gulberg');
  await vendor.getByRole('group', { name: 'Areas you serve' }).getByLabel('DHA').check();
  await vendor.getByLabel("What's usually included").fill('Serving staff');
  await vendor.getByRole('button', { name: 'Create my listing' }).click();
  await expect(vendor).toHaveURL(/\/vendor\?onboarded=1$/, { timeout: 30_000 });
  await expect(vendor.getByRole('heading', { name: businessName })).toBeVisible();
  await expect(vendor.getByText('Your listing is ready')).toBeVisible();
  const vendorId = psql(`select id from public.vendors where owner_id = '${userId(vendorEmail)}'`);
  expect(psql(`select array_to_string(areas_served, ',') from public.vendors where id = '${vendorId}'`)).toBe('Gulberg,DHA');

  // A host sends them an inquiry.
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host, hostEmail, '/plans');
  const { inquiryId } = seedInquiry(hostEmail, vendorId);
  await host.goto(`/inquiries/${inquiryId}`);
  await expect(main(host).getByText('No quote yet')).toBeVisible();

  // The vendor sees the event in the inbox, but never the budget.
  await vendor.goto('/vendor/inquiries');
  await expect(main(vendor).getByText('New: waiting for your quote')).toBeVisible();
  expect(await main(vendor).innerText()).not.toMatch(BUDGET);
  await main(vendor).getByRole('link', { name: /^Open: Mehndi/ }).click();
  await expect(vendor).toHaveURL(new RegExp(`/vendor/inquiries/${inquiryId}$`));
  await expect(vendor.getByRole('heading', { name: 'Mehndi / mayun / dholki in Gulberg' })).toBeVisible();
  await expect(main(vendor).getByText('Salam, are you free on 19 December?')).toBeVisible();
  expect(await main(vendor).innerText()).not.toMatch(BUDGET);

  // The live preview reacts to the price before anything is sent.
  const preview = main(vendor).getByRole('region', { name: 'What the host will see' });
  await expect(preview).toContainText('Enter a price');
  await main(vendor).getByLabel('Your price').fill('9000');
  await expect(main(vendor).getByText('Total for the host: Rs 2,700,000')).toBeVisible();
  await expect(preview).toContainText('Well above the typical range', { timeout: 15_000 });
  await expect(preview).toContainText('Sample numbers');
  await main(vendor).getByLabel('Your price').fill('3000');
  await main(vendor).getByLabel('Included', { exact: true }).fill('Serving staff');
  await expect(preview).toContainText('Within the typical range', { timeout: 15_000 });
  await expect(preview).toContainText('Service tax');
  await expect(preview).not.toContainText('Serving staff');
  expect(await preview.innerText()).not.toMatch(ACCUSATION_WORDS);
  expect(psql(`select count(*) from public.quotes where inquiry_id = '${inquiryId}'`)).toBe('0');

  await main(vendor).getByRole('button', { name: 'Send quote' }).click();
  await expect(vendor).toHaveURL(new RegExp(`/vendor/inquiries/${inquiryId}\\?quoted=1$`), { timeout: 30_000 });
  await expect(vendor.getByText('Your quote was sent')).toBeVisible();
  await expect(main(vendor).getByText('Rs 3,000 per head')).toBeVisible();
  expect(psql(`select total_pkr from public.quotes where inquiry_id = '${inquiryId}'`)).toBe('900000');

  // The host's open page shows the quote and its label without a reload, then books it.
  await expect(main(host).getByText('Within the typical range')).toBeVisible({ timeout: 20_000 });
  await expect(main(host).getByText('Rs 900,000').first()).toBeVisible();
  await main(host).getByRole('button', { name: 'Book for Rs 900,000' }).click();
  await expect(host).toHaveURL(/\/bookings\/[0-9a-f-]{36}\?booked=1$/, { timeout: 30_000 });
  expect(psql(`select amount_pkr from public.bookings where inquiry_id = '${inquiryId}'`)).toBe('900000');

  await vendor.reload();
  await expect(main(vendor).getByText('The host booked this quote')).toBeVisible();
  await expect(main(vendor).getByRole('button', { name: 'Send quote' })).toHaveCount(0);

  await vendorContext.close();
  await hostContext.close();
});

test('a vendor declines an inquiry and cannot open other vendors\' inquiries', async ({ browser }) => {
  test.setTimeout(180_000);
  const vendorEmail = uniqueEmail('decliner');
  const hostEmail = uniqueEmail('decline-host');

  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host, hostEmail, '/plans');
  const journey = seedJourney(hostEmail);

  const vendorContext = await browser.newContext();
  const vendor = await vendorContext.newPage();
  await signIn(vendor, vendorEmail, '/plans');
  const vendorId = seedListing(vendorEmail);
  const { inquiryId } = seedInquiry(hostEmail, vendorId);

  await vendor.goto(`/vendor/inquiries/${inquiryId}`);
  await main(vendor).getByRole('button', { name: 'Decline this inquiry' }).click();
  await expect(vendor).toHaveURL(/\?declined=1$/, { timeout: 30_000 });
  await expect(main(vendor).getByText('You declined this inquiry.')).toBeVisible();
  await expect(main(vendor).getByRole('button', { name: 'Send quote' })).toHaveCount(0);
  expect(psql(`select status from public.inquiries where id = '${inquiryId}'`)).toBe('declined');

  await host.goto(`/inquiries/${inquiryId}`);
  await expect(main(host).getByText('Declined by the vendor')).toBeVisible();

  // Another vendor's inquiry (the demo caterer's) is not found, through either page.
  for (const path of [`/vendor/inquiries/${journey.quotedInquiryId}`, `/inquiries/${journey.quotedInquiryId}`]) {
    await vendor.goto(path);
    await expect(vendor.getByRole('heading', { name: 'Page not found' }), path).toBeVisible();
  }
  expect(psql(`select count(*) from public.quotes where inquiry_id = '${journey.quotedInquiryId}'`)).toBe('1');

  await vendorContext.close();
  await hostContext.close();
});

test('the listing form refuses contact details and saves edits', async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail('listing');
  await signIn(page, email, '/plans');
  const vendorId = seedListing(email);

  await page.goto('/vendor/profile');
  await expect(page.getByRole('heading', { name: 'My listing' })).toBeVisible();
  await expect(main(page).getByLabel('Business name')).toHaveValue('E2E Caterers');
  await main(page).getByLabel('About your business').fill('Call us on 0300 1234567 for menus');
  await main(page).getByRole('button', { name: 'Save changes' }).click();
  await expect(main(page).getByText('without phone numbers or emails').first()).toBeVisible();
  // The rejected text stays in the box to be fixed.
  await expect(main(page).getByLabel('About your business')).toHaveValue('Call us on 0300 1234567 for menus');

  await main(page).getByLabel('About your business').fill('Mehndi and walima menus for up to 800 guests');
  await main(page).getByLabel('Largest event (guests)').fill('800');
  await main(page).getByRole('button', { name: 'Save changes' }).click();
  await expect(main(page).getByText('Your listing is saved.')).toBeVisible();
  expect(psql(`select description || '|' || capacity_max from public.vendors where id = '${vendorId}'`)).toBe('Mehndi and walima menus for up to 800 guests|800');
});

test('a vendor checks a portfolio photo (#7) and nothing is saved', async ({ page }) => {
  test.setTimeout(120_000);
  const email = uniqueEmail('portfolio');
  await signIn(page, email, '/plans');
  seedListing(email);

  await page.goto('/vendor/profile');
  const panel = main(page).getByRole('region', { name: 'Check a portfolio photo' });
  await expect(panel.getByRole('button', { name: 'Check photo' })).toBeDisabled();
  await panel.getByLabel(/Choose a photo/).setInputFiles({ name: 'stage.png', mimeType: 'image/png', buffer: Buffer.from(TINY_PNG, 'base64') });
  await expect(panel.getByRole('img', { name: 'The photo you chose' })).toBeVisible();
  await panel.getByRole('button', { name: 'Check photo' }).click();
  // Fixtures answer "unique"; the real server may say any of the three, or be unavailable.
  await expect(
    panel.getByText('No copy found').or(panel.getByText(/already on another listing|Looks very like/)).or(panel.getByText("isn't available right now")),
  ).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText(ACCUSATION_WORDS)).toHaveCount(0);
});

test('a vendor cannot send a quote with contact details or a price of zero', async ({ browser }) => {
  test.setTimeout(180_000);
  const vendorEmail = uniqueEmail('quote-rules');
  const hostEmail = uniqueEmail('quote-rules-host');

  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host, hostEmail, '/plans');

  const vendorContext = await browser.newContext();
  const vendor = await vendorContext.newPage();
  await signIn(vendor, vendorEmail, '/plans');
  const { inquiryId } = seedInquiry(hostEmail, seedListing(vendorEmail));

  await vendor.goto(`/vendor/inquiries/${inquiryId}`);
  await main(vendor).getByLabel('Your price').fill('0');
  await main(vendor).getByRole('button', { name: 'Send quote' }).click();
  await expect(main(vendor).getByText('Enter a price such as')).toBeVisible();

  await main(vendor).getByLabel('Your price').fill('3000');
  await main(vendor).getByLabel('Notes for the host (optional)').fill('WhatsApp me on 0300-1234567');
  await main(vendor).getByRole('button', { name: 'Send quote' }).click();
  await expect(main(vendor).getByText('Keep notes under 2,000 characters, without phone numbers or emails.')).toBeVisible();
  expect(psql(`select count(*) from public.quotes where inquiry_id = '${inquiryId}'`)).toBe('0');

  await vendorContext.close();
  await hostContext.close();
});

test('the chat keeps contact details, meetings and outside deals off Shevent until a booking', async ({ browser }) => {
  test.setTimeout(180_000);
  const vendorEmail = uniqueEmail('guard');
  const hostEmail = uniqueEmail('guard-host');

  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host, hostEmail, '/plans');
  const vendorContext = await browser.newContext();
  const vendor = await vendorContext.newPage();
  await signIn(vendor, vendorEmail, '/plans');
  const vendorId = seedListing(vendorEmail);
  const { planId, inquiryId } = seedInquiry(hostEmail, vendorId);
  const sentBy = (email: string) => psql(`select count(*) from public.messages where inquiry_id = '${inquiryId}' and sender_id = '${userId(email)}'`);
  const blocked = () => psql(`select count(*) from private.blocked_messages where inquiry_id = '${inquiryId}'`);

  await host.goto(`/inquiries/${inquiryId}`);
  await vendor.goto(`/vendor/inquiries/${inquiryId}`);
  const vendorChat = vendor.locator('ol[aria-live="polite"]:visible');
  const hostChat = host.locator('ol[aria-live="polite"]:visible');
  await expect(main(vendor).getByText('Keep it on Shevent until you book')).toBeVisible();

  // The vendor offers a cheaper price by phone: nothing is sent, the draft stays, and they're told why.
  const offer = 'Call me on 0300 1234567, I can do it for 19 lakh';
  await main(vendor).getByLabel('Message').fill(offer);
  await main(vendor).getByRole('button', { name: 'Send', exact: true }).click();
  const alert = main(vendor).getByRole('alert');
  await expect(alert).toContainText('Not sent: it looks like it has a phone number.');
  await expect(main(vendor).getByLabel('Message')).toHaveValue(offer);
  expect(sentBy(vendorEmail)).toBe('0');
  expect(blocked()).toBe('1');

  // Roman Urdu meeting plans too; the second block says it's counted.
  await main(vendor).getByLabel('Message').fill('Milte hain kal, office aa jayen');
  await main(vendor).getByRole('button', { name: 'Send', exact: true }).click();
  await expect(alert).toContainText('a plan to meet or visit in person');
  await expect(alert).toContainText("That's 2 blocked messages from you in this chat");

  // The same offer, kept on Shevent, goes through and reaches the host live.
  await main(vendor).getByLabel('Message').fill('I can do it for 19 lakh, I will send a revised quote here.');
  await main(vendor).getByRole('button', { name: 'Send', exact: true }).click();
  await expect(vendorChat.getByText('I can do it for 19 lakh, I will send a revised quote here.')).toBeVisible();
  await expect(main(vendor).getByRole('alert')).toHaveCount(0);
  await expect(hostChat.getByText('I can do it for 19 lakh, I will send a revised quote here.')).toBeVisible({ timeout: 15_000 });

  // The host can't move the payment off Shevent either.
  await main(host).getByLabel('Message').fill('Can I pay in cash without Shevent?');
  await main(host).getByRole('button', { name: 'Send', exact: true }).click();
  await expect(main(host).getByRole('alert')).toContainText('a way to pay outside Shevent');
  expect(sentBy(hostEmail)).toBe('1'); // only the seeded first message

  // Quote notes: the form's own check passes (no number), the database catches the meeting.
  await main(vendor).getByLabel('Your price').fill('3000');
  await main(vendor).getByLabel('Notes for the host (optional)').fill('Visit our kitchen in Johar Town for a tasting');
  await main(vendor).getByRole('button', { name: 'Send quote' }).click();
  await expect(main(vendor).getByText('Remove a plan to meet or visit in person.')).toBeVisible();
  expect(psql(`select count(*) from public.quotes where inquiry_id = '${inquiryId}'`)).toBe('0');

  // Once it's booked on Shevent, the price is on record: numbers can be shared to plan the day.
  const quoteId = psql(`insert into public.quotes (inquiry_id, amount_pkr, unit, total_pkr) values ('${inquiryId}', 3000, 'per_head', 900000) returning id`).split('\n')[0]!;
  psql(`
    insert into public.bookings (quote_id, inquiry_id, plan_id, vendor_id, host_id, amount_pkr)
      values ('${quoteId}', '${inquiryId}', '${planId}', '${vendorId}', '${userId(hostEmail)}', 900000);
    update public.inquiries set status = 'booked' where id = '${inquiryId}';
  `);
  await host.reload();
  await expect(main(host).getByText("You've booked on Shevent, so you can share contact details")).toBeVisible();
  await main(host).getByLabel('Message').fill('My number for the day is 0300 1234567');
  await main(host).getByRole('button', { name: 'Send', exact: true }).click();
  await expect(hostChat.getByText('My number for the day is 0300 1234567')).toBeVisible();
  await expect(vendorChat.getByText('My number for the day is 0300 1234567')).toBeVisible({ timeout: 15_000 });

  await vendorContext.close();
  await hostContext.close();
});
