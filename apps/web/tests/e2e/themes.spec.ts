// Themes (2026-10-28 redesign): every theme passes axe, the choice survives a reload, and "System"
// follows the OS. Plus the date field's calendar, which only exists for mouse/trackpad browsers.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const THEMES = ['Light', 'Dark', 'Sand', 'Ocean'] as const;

async function expectNoSeriousViolations(page: Page, name: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    serious.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`),
    name,
  ).toEqual([]);
}

async function chooseTheme(page: Page, theme: string) {
  await page.getByRole('button', { name: /^Theme:/ }).click();
  // The radio itself is visually hidden; people click its label.
  await page.locator('label').filter({ has: page.getByRole('radio', { name: theme, exact: true }) }).click();
  await expect(page.getByRole('radio', { name: theme, exact: true })).toBeChecked();
  await page.keyboard.press('Escape');
}

test('every theme is readable on the landing page and the sign-in page', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  for (const theme of THEMES) {
    await chooseTheme(page, theme);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme.toLowerCase());
    await expectNoSeriousViolations(page, `/ (${theme})`);
  }
  await page.goto('/sign-in');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ocean');
  await expectNoSeriousViolations(page, '/sign-in (Ocean)');
});

test('the chosen theme survives a reload, and System follows the OS', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await chooseTheme(page, 'Sand');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sand');
  await expect(page.getByRole('button', { name: 'Theme: Sand' })).toBeVisible();

  await chooseTheme(page, 'System');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('the calendar fills in the date field', async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones keep their own date picker');
  await page.goto('/#try');
  await page.waitForLoadState('networkidle');
  const widget = page.locator('#try');
  const calendarButton = widget.getByRole('button', { name: 'Open calendar' });
  test.skip(!(await calendarButton.isVisible()), 'this browser keeps its own date picker');

  await calendarButton.click();
  const calendar = page.getByRole('dialog', { name: 'Calendar' });
  await expect(calendar).toBeVisible();
  await calendar.getByRole('button', { name: 'Next month' }).click();
  // Leading days of the grid can be past (disabled): pick the first Monday that can be chosen.
  await calendar.locator('button[aria-label^="Monday, "]:not([disabled])').first().click();
  await expect(calendar).toBeHidden();
  await expect(widget.getByLabel('Date')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await expect(widget.getByLabel('Date')).toBeFocused();
});
