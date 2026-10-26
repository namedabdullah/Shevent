// Shared helpers for the Playwright suites. They talk to the LOCAL Supabase only: Mailpit for
// magic-link emails and `docker exec psql` to set up data a journey needs but doesn't test (the
// host's plan, a vendor's listing). Never point these at a hosted project.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page } from '@playwright/test';

export const MAILPIT = 'http://127.0.0.1:54324';

export function psql(sql: string): string {
  return execFileSync('docker', ['exec', 'supabase_db_shevent', 'psql', '-U', 'postgres', '-tAc', sql]).toString().trim();
}

export const uniqueEmail = (label: string) => `${label}-${Date.now()}-${randomUUID().slice(0, 6)}@example.com`;

async function latestLink(email: string): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json();
    const first = list.messages?.[0];
    if (first) {
      const message = await (await fetch(`${MAILPIT}/api/v1/message/${first.ID}`)).json();
      const link = /https?:\/\/[^\s"<>]+verify[^\s"<>]+/.exec(message.Text ?? message.HTML)?.[0];
      if (link) return link.replace(/&amp;/g, '&');
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No magic link arrived for ${email}`);
}

/** Requests a magic link for `email` and returns it without opening it. */
export async function requestMagicLink(page: Page, email: string, next = '/plans'): Promise<string> {
  const path = `/sign-in?next=${encodeURIComponent(next)}`;
  // Already there (e.g. redirected from a private page): Firefox aborts a reload of the same URL.
  const current = page.url() === 'about:blank' ? '' : new URL(page.url());
  if (!current || `${current.pathname}${current.search}` !== path) await page.goto(path);
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
  // The first email after the server has been idle can take several seconds to send.
  await expect(page.getByRole('status')).toContainText(email, { timeout: 30_000 });
  return latestLink(email);
}

/** Signs in through the real UI (magic link) and waits for the landing page. */
export async function signIn(page: Page, email: string, next = '/plans'): Promise<void> {
  const link = await requestMagicLink(page, email, next);
  await page.goto(link);
  await page.waitForURL((url) => url.pathname === next, { timeout: 45_000 });
}

export function userId(email: string): string {
  return psql(`select id from auth.users where email = '${email}'`);
}

const estimateJson = readFileSync(join(__dirname, '../../../../packages/core/fixtures/estimate.response.json'), 'utf8');

export const DEMO_VENDORS = {
  caterer: '00000000-0000-4000-8000-000000000201',
  caterer2: '00000000-0000-4000-8000-000000000202',
};

export interface Journey {
  hostId: string;
  planId: string;
  /** Inquiry with a quote waiting (status "quoted"). */
  quotedInquiryId: string;
  quoteId: string;
  /** Inquiry that has been booked. */
  bookedInquiryId: string;
  bookingId: string;
}

/** A host's plan with the fixture estimate, one quoted inquiry and one booked inquiry. */
export function seedJourney(email: string): Journey {
  const hostId = userId(email);
  const [planId, quotedInquiryId, quoteId, bookedInquiryId, bookedQuoteId, bookingId] = Array.from({ length: 6 }, () => randomUUID());
  psql(`
    insert into public.plans (id, owner_id, event_type, guest_count, area, venue_type, event_date, total_budget_pkr, preferences, estimate)
      values ('${planId}', '${hostId}', 'wedding_mehndi', 300, 'Gulberg', 'marquee', '2026-12-19', 2500000, array['decor_heavy'], $j$${estimateJson}$j$::jsonb);
    insert into public.inquiries (id, plan_id, vendor_id, host_id, status) values
      ('${quotedInquiryId}', '${planId}', '${DEMO_VENDORS.caterer}', '${hostId}', 'open'),
      ('${bookedInquiryId}', '${planId}', '${DEMO_VENDORS.caterer2}', '${hostId}', 'open');
    insert into public.quotes (id, inquiry_id, amount_pkr, unit, total_pkr, inclusions) values
      ('${quoteId}', '${quotedInquiryId}', 3000, 'per_head', 900000, array['Serving staff']),
      ('${bookedQuoteId}', '${bookedInquiryId}', 3200, 'per_head', 960000, array['Serving staff', 'Tax included']);
    insert into public.bookings (id, quote_id, inquiry_id, plan_id, vendor_id, host_id, amount_pkr)
      values ('${bookingId}', '${bookedQuoteId}', '${bookedInquiryId}', '${planId}', '${DEMO_VENDORS.caterer2}', '${hostId}', 960000);
    update public.inquiries set status = 'booked' where id = '${bookedInquiryId}';
  `);
  return { hostId, planId, quotedInquiryId, quoteId, bookedInquiryId, bookingId };
}

/** The host's plan (budget 25 lakh) and an open inquiry to `vendorId`, with one message from the host. */
export function seedInquiry(hostEmail: string, vendorId: string): { planId: string; inquiryId: string } {
  const hostId = userId(hostEmail);
  const [planId, inquiryId] = [randomUUID(), randomUUID()];
  psql(`
    insert into public.plans (id, owner_id, event_type, guest_count, area, venue_type, event_date, total_budget_pkr, preferences, estimate)
      values ('${planId}', '${hostId}', 'wedding_mehndi', 300, 'Gulberg', 'marquee', '2026-12-19', 2500000, array['decor_heavy'], $j$${estimateJson}$j$::jsonb);
    insert into public.inquiries (id, plan_id, vendor_id, host_id) values ('${inquiryId}', '${planId}', '${vendorId}', '${hostId}');
    insert into public.messages (inquiry_id, sender_id, body) values ('${inquiryId}', '${hostId}', 'Salam, are you free on 19 December?');
  `);
  return { planId, inquiryId };
}

/** Turns a signed-in account into a vendor with a catering listing, as onboarding would. Returns the vendor id. */
export function seedListing(email: string): string {
  const ownerId = userId(email);
  const slug = `e2e-caterers-${randomUUID().slice(0, 8)}`;
  return psql(`
    update public.profiles set role = 'vendor' where id = '${ownerId}';
    insert into public.vendors (owner_id, slug, name, category, base_area, areas_served)
      values ('${ownerId}', '${slug}', 'E2E Caterers', 'catering', 'Gulberg', array['Gulberg']::public.lahore_area[])
      returning id;
  `)
    .split('\n')
    .find((line) => /^[0-9a-f-]{36}$/.test(line))!;
}

/** Words the plan forbids in quote guidance (WEB_APP_PLAN §5.4). */
export const ACCUSATION_WORDS = /\b(scam|scammer|fraud|cheat|cheating|overcharg\w*|rip-?off)\b/i;
