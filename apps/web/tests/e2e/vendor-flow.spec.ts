// S6 Vendor journey + the two-sided demo (WEB_APP_PLAN §9 Phase 3 gate): a vendor onboards, gets an
// inquiry, sends a quote with a live fairness preview, the host sees the label live and books.
// S7 honesty: the vendor never sees the host's budget, and the preview uses guidance wording.
import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { ACCUSATION_WORDS, psql, seedInquiry, seedJourney, seedListing, signIn, uniqueEmail, userId } from './helpers';

const BUDGET = /25 lakh|2,500,000|2500000/;

const main = (page: Page) => page.locator('main:visible');

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
