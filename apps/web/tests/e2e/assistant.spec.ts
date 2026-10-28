// #8 Planning assistant on the web (WEB_APP_PLAN §4.2), on fixtures: it asks for what is missing,
// shows the #1/#2 split once the plan is complete, and every save goes through the planner form.
import { expect, test, type Page } from '@playwright/test';
import { signIn, uniqueEmail } from './helpers';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** About two months ahead, written the way people type it: "19 December 2026". */
function futureDate() {
  const date = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  return { iso: date.toISOString().slice(0, 10), words: `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}` };
}

async function openAssistant(page: Page, label: string) {
  await signIn(page, uniqueEmail(label), '/assistant');
  await expect(page.getByRole('heading', { name: 'Planning assistant' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Assistant' })).toHaveAttribute('aria-current', 'page');
  await page.waitForLoadState('networkidle');
  return {
    chat: page.getByRole('list', { name: 'Conversation with the planning assistant' }),
    input: page.getByLabel('Your message'),
  };
}

test('the assistant asks for what is missing, shows the split and saves through the planner', async ({ page }) => {
  test.setTimeout(120_000);
  const date = futureDate();
  const { chat, input } = await openAssistant(page, 'assistant');

  await input.fill('mehndi karni hai 300 log, Gulberg mein');
  await input.press('Enter');
  await expect(chat).toContainText('I still need the date and your total budget');
  await expect(chat.getByText('still needed', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Sample numbers')).toBeVisible();
  await expect(input).toBeFocused();

  await input.fill(`${date.words}, budget 25 lakh`);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(chat.locator('tbody tr')).toHaveCount(6);
  await expect(chat.getByRole('row', { name: /Catering/ })).toContainText('Rs 9.5 lakh');
  // The reply's numbers are the host's own and the estimate's.
  await expect(chat).toContainText('The biggest share goes to catering, about Rs 9.5 lakh.');

  await chat.getByRole('link', { name: 'Save as a plan' }).click();
  await expect(page).toHaveURL(/\/plan\/new\?/);
  await expect(page.getByLabel('Type of event')).toHaveValue('wedding_mehndi');
  await expect(page.getByLabel('Number of guests')).toHaveValue('300');
  await expect(page.getByLabel('Area in Lahore')).toHaveValue('Gulberg');
  await expect(page.getByLabel('Date')).toHaveValue(date.iso);
  await expect(page.getByText("That's Rs 25 lakh.")).toBeVisible();
  await page.getByRole('button', { name: 'Get my budget split' }).click();
  await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}\?created=1$/, { timeout: 30_000 });
});

test('Urdu input works, and the assistant hands over to the form when it cannot follow', async ({ page }) => {
  test.setTimeout(120_000);
  const { chat, input } = await openAssistant(page, 'assistant-ur');

  await page.getByRole('button', { name: /گلبرگ/ }).click();
  const urdu = chat.locator('p[lang="ur"]');
  await expect(urdu).toHaveCount(1);
  await expect(chat).toContainText('I still need the date');
  // The example chips are only for starting a conversation.
  await expect(page.getByRole('button', { name: /گلبرگ/ })).toHaveCount(0);

  for (const message of ['hmm', 'not sure yet', 'let me think']) {
    await input.fill(message);
    await input.press('Enter');
    await expect(chat.getByText(message, { exact: true })).toBeVisible();
    // Enter does nothing while a reply is on its way, so wait for it like a person would.
    await expect(chat.getByText('Thinking…')).toHaveCount(0);
  }
  await expect(chat.getByRole('link', { name: 'Open the planner form' })).toBeVisible();
  await chat.getByRole('link', { name: 'Open the planner form' }).click();
  await expect(page).toHaveURL(/\/plan\/new\?/);
  await expect(page.getByLabel('Type of event')).toHaveValue('wedding_mehndi');
  await expect(page.getByLabel('Number of guests')).toHaveValue('300');
  await expect(page.getByLabel('Area in Lahore')).toHaveValue('Gulberg');
  await expect(page.getByText("That's Rs 25 lakh.")).toBeVisible();
});

test('the assistant needs sign-in', async ({ page }) => {
  await page.goto('/assistant');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fassistant$/);
});
