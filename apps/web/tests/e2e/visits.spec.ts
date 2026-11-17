// Venue visits on record: instead of arranging a visit in the chat (blocked before a booking), the host
// requests one, the venue confirms it with the address, and both pages update live.
import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { psql, seedInquiry, signIn, uniqueEmail, userId } from './helpers';

const main = (page: Page) => page.locator('main:visible');

/** axe on the visit card: serious and critical violations fail. */
async function expectAccessibleCard(page: Page, name: string) {
  const { violations } = await new AxeBuilder({ page })
    .include('section[aria-labelledby="visit-heading"]')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious.map((v) => `${v.id}: ${v.help}`), name).toEqual([]);
}

/** A signed-in account becomes a vendor with a marquee listing. Returns the vendor id. */
function seedVenue(email: string): string {
  return psql(`
    update public.profiles set role = 'vendor' where id = '${userId(email)}';
    insert into public.vendors (owner_id, slug, name, category, sub_type, base_area, areas_served)
      values ('${userId(email)}', 'e2e-marquee-${randomUUID().slice(0, 8)}', 'E2E Marquee', 'venue', 'marquee', 'Gulberg', array['Gulberg']::public.lahore_area[])
      returning id;
  `)
    .split('\n')
    .find((line) => /^[0-9a-f-]{36}$/.test(line))!;
}

test('a host requests a venue visit, the venue confirms it with the address, and either side can cancel', async ({ browser }) => {
  test.setTimeout(180_000);
  const vendorEmail = uniqueEmail('visit-venue');
  const hostEmail = uniqueEmail('visit-host');

  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await signIn(host, hostEmail, '/plans');
  const vendorContext = await browser.newContext();
  const vendor = await vendorContext.newPage();
  await signIn(vendor, vendorEmail, '/plans');
  const { inquiryId } = seedInquiry(hostEmail, seedVenue(vendorEmail));

  // Asking in the chat is blocked, and points to the visit request.
  await host.goto(`/inquiries/${inquiryId}`);
  await main(host).getByLabel('Message').fill('Can I visit the hall tomorrow evening?');
  await main(host).getByRole('button', { name: 'Send', exact: true }).click();
  await expect(main(host).getByRole('alert')).toContainText('request a visit on this page');

  // The host requests a visit three days from now at 4 pm.
  const day = new Date(Date.now() + 3 * 864e5 + 5 * 36e5).toISOString().slice(0, 10);
  const visit = main(host).getByRole('region', { name: 'Visit the venue' });
  await expectAccessibleCard(host, 'host request form');
  await visit.getByLabel('Day').fill(day);
  await visit.getByLabel('Time').selectOption('16:00');
  await visit.getByLabel(/Anything you'd like to see/).fill('Can we see the lawn and the stage?');
  await visit.getByRole('button', { name: 'Request a visit' }).click();
  await expect(host).toHaveURL(/\?visit=requested$/, { timeout: 30_000 });
  await expect(main(host).getByRole('region', { name: 'Visit the venue' })).toContainText('Visit requested:');
  await expect(main(host).getByRole('region', { name: 'Visit the venue' })).toContainText('4:00 pm');

  // The venue sees it in the inbox, then confirms; an address can't carry a phone number.
  await vendor.goto('/vendor/inquiries');
  await expect(main(vendor).getByText(/Visit requested: .*4:00 pm/)).toBeVisible();
  await vendor.goto(`/vendor/inquiries/${inquiryId}`);
  const venueCard = main(vendor).getByRole('region', { name: 'Visit the venue' });
  await expect(venueCard).toContainText('The host would like to visit');
  await expect(venueCard).toContainText('Can we see the lawn and the stage?');
  await venueCard.getByLabel('Address for the visit').fill('Plot 5, Main Boulevard. WhatsApp 0321 1234567');
  await venueCard.getByRole('button', { name: 'Confirm the visit' }).click();
  await expect(venueCard.getByText('Remove a phone number.')).toBeVisible();
  await expectAccessibleCard(vendor, 'venue confirm form, with an error');
  await venueCard.getByLabel('Address for the visit').fill('Plot 5, Main Boulevard, Gulberg III');
  await venueCard.getByLabel('Note for the host (optional)').fill('Use gate 2 and ask for the manager');
  await venueCard.getByRole('button', { name: 'Confirm the visit' }).click();
  await expect(vendor).toHaveURL(/\?visit=confirmed$/, { timeout: 30_000 });
  expect(psql(`select status || ' ' || venue_address from public.visits where inquiry_id = '${inquiryId}'`)).toBe('confirmed Plot 5, Main Boulevard, Gulberg III');

  // The host's open page shows the confirmation live, and the chat can now talk about the visit.
  const hostCard = main(host).getByRole('region', { name: 'Visit the venue' });
  await expect(hostCard).toContainText('Visit confirmed:', { timeout: 15_000 });
  await expect(hostCard).toContainText('Plot 5, Main Boulevard, Gulberg III');
  await expect(hostCard).toContainText('Use gate 2 and ask for the manager');
  await expectAccessibleCard(host, 'host, visit confirmed');
  await main(host).getByLabel('Message').fill('Great, I will come to the hall at 4');
  await main(host).getByRole('button', { name: 'Send', exact: true }).click();
  await expect(host.locator('ol[aria-live="polite"]:visible').getByText('Great, I will come to the hall at 4')).toBeVisible();

  // The host cancels; the venue is told.
  await hostCard.getByRole('button', { name: 'Cancel the visit' }).click();
  await expect(host).toHaveURL(/\?visit=cancelled$/, { timeout: 30_000 });
  await expect(main(host).getByText('The visit is cancelled.')).toBeVisible();
  await vendor.goto(`/vendor/inquiries/${inquiryId}`);
  await expect(main(vendor).getByText(/The host cancelled the visit on .*4:00 pm/)).toBeVisible();

  await vendorContext.close();
  await hostContext.close();
});
