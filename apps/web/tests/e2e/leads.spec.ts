// S6 Lead forms + S8 abuse/XSS: the waitlist saves one row with its UTM values.
import { expect, test } from '@playwright/test';
import { psql, uniqueEmail } from './helpers';

const rows = (email: string) => Number(psql(`select count(*) from public.leads where contact = '${email}'`));

test('invalid input shows a message, keeps what was typed, and saves nothing', async ({ page }) => {
  await page.goto('/');
  const input = page.getByLabel('Email or WhatsApp number');
  await input.fill('hello');
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByText('Enter an email address or a phone number.')).toBeVisible();
  await expect(input).toHaveValue('hello');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(Number(psql(`select count(*) from public.leads where contact = 'hello'`))).toBe(0);
});

test('a valid sign-up saves one row with its UTM values and landing path', async ({ page }) => {
  const email = uniqueEmail('lead');
  await page.goto('/?utm_source=whatsapp&utm_medium=dm&utm_campaign=e2e');
  await page.getByLabel('Email or WhatsApp number').fill(email);
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByRole('status')).toContainText("You're on the list");
  expect(psql(`select type || '|' || utm_source || '|' || utm_medium || '|' || utm_campaign || '|' || landing_path from public.leads where contact = '${email}'`)).toBe(
    'waitlist|whatsapp|dm|e2e|/',
  );
});

test('a Pakistani phone number is accepted', async ({ page }) => {
  const phone = `0300-${String(Date.now()).slice(-7)}`;
  await page.goto('/');
  await page.getByLabel('Email or WhatsApp number').fill(phone);
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByRole('status')).toContainText("You're on the list");
  expect(rows(phone)).toBe(1);
  psql(`delete from public.leads where contact = '${phone}'`);
});

test('double-clicking submit saves exactly one row', async ({ page }) => {
  const email = uniqueEmail('double');
  await page.goto('/');
  await page.getByLabel('Email or WhatsApp number').fill(email);
  await page.getByRole('button', { name: 'Join the waitlist' }).dblclick();
  await expect(page.getByRole('status')).toBeVisible();
  expect(rows(email)).toBe(1);
});

test('a bot that fills the hidden field is not saved', async ({ page }) => {
  const email = uniqueEmail('bot');
  await page.goto('/');
  await page.getByLabel('Email or WhatsApp number').fill(email);
  await page.locator('input[name="website"]').evaluate((el: HTMLInputElement) => (el.value = 'http://spam.example'));
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  expect(rows(email)).toBe(0);
});

test('over-long input is rejected on the server side too', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email or WhatsApp number').evaluate((el: HTMLInputElement) => el.removeAttribute('maxlength'));
  await page.getByLabel('Email or WhatsApp number').fill(`${'a'.repeat(250)}@example.com`);
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByText('Enter an email address or a phone number.')).toBeVisible();
});

test('script-like input is stored and shown as plain text, never run', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  const payload = `<script>alert(1)</script>${Date.now()}@example.com`;
  await page.goto('/');
  await page.getByLabel('Email or WhatsApp number').fill(payload);
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await page.waitForTimeout(500);
  expect(dialogs).toEqual([]);
  expect(rows(payload.replace(/'/g, "''"))).toBe(1);

  // The attack string with spaces isn't a valid contact at all.
  await page.goto('/');
  await page.getByLabel('Email or WhatsApp number').fill('"><img src=x onerror=alert(1)>');
  await page.getByRole('button', { name: 'Join the waitlist' }).click();
  await expect(page.getByText('Enter an email address or a phone number.')).toBeVisible();
  expect(dialogs).toEqual([]);
});
