import { test, expect } from './accountFixture';
import type { Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import inventoryScreenshots from '../fixtures/inventory-screenshots.json' with { type: 'json' };
import codexScreenshot from '../fixtures/codex-screenshot.json' with { type: 'json' };
import type { Inventory } from '../../src/lib/model';
import { createEquipment } from '../../src/lib/model';
import { parseDropTables } from '../../src/lib/dropTableParser';

async function waitForSave(page: Page) {
  await expect(page.getByRole('status', { name: 'Save status', exact: true })).toHaveText('Saved');
}

async function chooseOption(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('listbox', { name: label, exact: true }).getByRole('option', { name: option, exact: true }).click();
}

async function equipmentScreenshot(page: Page, name: string, lines: string[]) {
  const dataUrl = await page.evaluate(text => {
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 600;
    const context = canvas.getContext('2d')!; context.fillStyle = '#181e23'; context.fillRect(0, 0, 1200, 600);
    context.fillStyle = '#ffffff'; context.font = '36px Arial';
    text.forEach((line, index) => context.fillText(line, 80, 100 + index * 120));
    return canvas.toDataURL('image/png');
  }, lines);
  return { name, mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') };
}

async function waitForScreenshotReview(page: Page) {
  await expect(page.getByRole('heading', { name: 'Review matches' })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('progressbar', { name: 'Screenshot reading progress' })).toHaveCount(0, { timeout: 120000 });
}

async function expectImportFinished(page: Page) {
  await expect(page).toHaveURL(/#weapons$/);
  await expect(page.getByRole('region', { name: 'Weapons', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Import screenshots', exact: true })).toHaveCount(0);
}

test('inventory edits persist, full fields are available, and equipment can be added', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto('/'); await waitForSave(page);
  await expect(page.getByRole('region', { name: 'Weapons', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(30);
  await page.getByLabel('Search weapons').fill('Boltor');
  await page.getByLabel('Owned: Boltor', { exact: true }).click();
  await expect(page.getByLabel('Owned: Boltor', { exact: true })).toHaveCount(0);
  await waitForSave(page); await page.reload(); await waitForSave(page);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByLabel('Owned only', { exact: true }).uncheck();
  await page.getByLabel('Search weapons').fill('Boltor');
  await expect(page.getByLabel('Owned: Boltor', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Edit Boltor', exact: true }).click();
  await page.getByRole('tab', { name: 'My inventory' }).click();
  await page.getByLabel('Notes', { exact: true }).fill('Keep for my next build');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  const columnOptions = page.getByRole('group', { name: 'Table columns' }).getByRole('checkbox');
  for (const option of await columnOptions.all()) if (!await option.isChecked()) await option.check();
  await expect(page.getByRole('columnheader')).toHaveText(['Weapon', 'Owned', 'Rank', 'Mastered', 'Incarnon', 'Upgraded', 'Recommended action', 'Crafting target', 'Crafting ingredient', 'Variant', 'Quest weapon', 'Meta / powerful', 'Slot', 'Has Prime variant', 'Notes']);
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Warframes' }).click();
  await page.getByRole('button', { name: 'Add Warframe', exact: true }).click();
  await page.getByLabel('Find in the Warframe catalog').fill('Wisp Prime');
  await page.getByRole('button', { name: 'Wisp Prime Warframe', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add Warframe', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Wisp Prime' })).toBeVisible();
  await waitForSave(page); await page.reload(); await waitForSave(page);
  await expect(page.getByRole('button', { name: 'Edit Wisp Prime' })).toBeVisible();
  await page.screenshot({ path: 'test-results/warframes.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('table keeps rank separate from mastery and preserves sorting when changing unrelated columns', async ({ page, account }) => {
  await page.goto('/'); await waitForSave(page);
  await page.getByRole('region', { name: 'Weapons', exact: true }).waitFor();
  const inventory = await account.inventory();
  const ranks: Record<string, number | null> = { Anku: 0, 'Arca Titron': 30, Atomos: null, Bo: 9 };
  inventory.items = inventory.items.filter((item: { name: string }) => item.name in ranks).map((item: { name: string }) => ({ ...item, owned: true, rank: ranks[item.name], mastered: item.name === 'Anku' }));
  await account.setInventory(inventory);
  await waitForSave(page); await page.reload(); await waitForSave(page);
  const rows = page.locator('.inventory-table tbody tr');
  const names = page.locator('.inventory-table .equipment-label');
  const anku = rows.filter({ has: page.getByRole('button', { name: 'Edit Anku', exact: true }) });
  const arca = rows.filter({ has: page.getByRole('button', { name: 'Edit Arca Titron', exact: true }) });
  await expect(anku.getByRole('cell').nth(2)).toHaveText('0');
  await expect(anku.getByRole('checkbox', { name: 'Mastered: Anku', exact: true })).toBeChecked();
  await expect(arca.getByRole('cell').nth(2)).toHaveText('30');
  await expect(arca.getByRole('checkbox', { name: 'Mastered: Arca Titron', exact: true })).not.toBeChecked();
  const rankHeader = page.getByRole('button', { name: 'Rank column options', exact: true });
  const menu = page.getByRole('group', { name: /Column actions for/ });
  await rankHeader.click();
  await expect(names).toHaveText(['Anku', 'Arca Titron', 'Atomos', 'Bo']);
  await menu.getByRole('menuitemradio', { name: 'Sort ascending', exact: true }).click();
  await expect(names).toHaveText(['Anku', 'Bo', 'Arca Titron', 'Atomos']);
  await rankHeader.click();
  await menu.getByRole('menuitemradio', { name: 'Sort descending', exact: true }).click();
  await expect(names).toHaveText(['Arca Titron', 'Bo', 'Anku', 'Atomos']);
  await rankHeader.click();
  await menu.getByRole('menuitemradio', { name: 'Sort descending', exact: true }).click();
  await page.getByRole('button', { name: 'Owned column options', exact: true }).click();
  await menu.getByRole('menuitemradio', { name: 'Sort ascending', exact: true }).click();
  await rankHeader.click();
  await menu.getByRole('menuitemradio', { name: 'Sort ascending', exact: true }).click();
  await expect(rankHeader).toHaveAccessibleDescription('Sort priority 2 of 2, ascending');
  await expect(names).toHaveText(['Anku', 'Bo', 'Arca Titron', 'Atomos']);
  const first = page.getByRole('button', { name: 'Edit Anku', exact: true });
  await first.focus();
  await first.press('ArrowDown');
  const next = page.getByRole('button', { name: 'Edit Bo', exact: true });
  await expect(next).toBeFocused();
  await next.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Bo', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(next).toBeFocused();
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  const columns = page.getByRole('group', { name: 'Table columns' });
  await columns.getByRole('checkbox', { name: 'Upgraded', exact: true }).uncheck();
  await columns.getByRole('checkbox', { name: 'Slot', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(anku.getByRole('cell').nth(2)).toHaveText('0');
  await expect(anku.locator('.equipment-meta')).toHaveCount(0);
  await expect(names).toHaveText(['Anku', 'Bo', 'Arca Titron', 'Atomos']);
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  await columns.getByRole('button', { name: 'Reset to default' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('columnheader')).toHaveCount(8);
  await expect(names).toHaveText(['Anku', 'Bo', 'Arca Titron', 'Atomos']);
});

test('column choices migrate to Warframes once and persist independently without changing inventory', async ({ page, account }) => {
  await page.goto('/'); await waitForSave(page);
  await expect(page.getByRole('columnheader')).toHaveText(['Weapon', 'Owned', 'Rank', 'Mastered', 'Incarnon', 'Upgraded', 'Recommended action', 'Crafting target']);
  await expect(page.getByRole('button', { name: /^(All 14 fields|Compact view)$/ })).toHaveCount(0);
  const before = JSON.stringify(await account.inventory());
  const boltor = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Edit Boltor', exact: true }) });
  await expect(boltor.locator('.equipment-meta')).toHaveText('Primary');
  await expect(boltor.getByLabel('Incarnon: Boltor: Genesis compatible', { exact: true })).toHaveText('Genesis compatible');
  await page.getByRole('button', { name: 'Incarnon column options', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Sort ascending', exact: true }).click();
  const trigger = page.getByRole('button', { name: 'Columns', exact: true });
  await trigger.click();
  const columns = page.getByRole('group', { name: 'Table columns' });
  await expect(columns.getByRole('checkbox', { name: 'Weapon', exact: true })).toBeChecked();
  await expect(columns.getByRole('checkbox', { name: 'Weapon', exact: true })).toBeDisabled();
  await columns.getByRole('checkbox', { name: 'Incarnon', exact: true }).uncheck();
  await columns.getByRole('checkbox', { name: 'Recommended action', exact: true }).uncheck();
  await columns.getByRole('checkbox', { name: 'Notes', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  const chosenHeaders = ['Weapon', 'Owned', 'Rank', 'Mastered', 'Upgraded', 'Crafting target', 'Notes'];
  await expect(page.getByRole('columnheader')).toHaveText(chosenHeaders);
  await expect(page.locator('th[aria-sort]')).toHaveCount(0);
  await waitForSave(page); await page.reload(); await waitForSave(page);
  await expect(page.getByRole('columnheader')).toHaveText(chosenHeaders);
  await trigger.click();
  await columns.getByRole('checkbox', { name: 'Incarnon', exact: true }).check();
  await page.getByLabel('Search weapons').click();
  await expect(columns).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Incarnon column options', exact: true })).toHaveAccessibleDescription('Unsorted');
  await page.getByRole('link', { name: 'Warframes', exact: true }).click();
  await expect(page.getByRole('columnheader')).toHaveText(['Warframe', 'Owned', 'Rank', 'Mastered', 'Upgraded', 'Notes']);
  await trigger.click();
  await columns.getByRole('button', { name: 'Reset to default' }).click();
  await page.keyboard.press('Escape');
  const warframeHeaders = ['Warframe', 'Owned', 'Rank', 'Mastered', 'Upgraded', 'Recommended action', 'Has Prime variant', 'Helminth unlocked'];
  await expect(page.getByRole('columnheader')).toHaveText(warframeHeaders);
  await page.getByRole('link', { name: 'Weapons', exact: true }).click();
  await expect(page.getByRole('columnheader')).toHaveText(['Weapon', 'Owned', 'Rank', 'Mastered', 'Incarnon', 'Upgraded', 'Crafting target', 'Notes']);
  await trigger.click();
  await columns.getByRole('button', { name: 'Reset to default' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Warframes', exact: true }).click();
  await page.reload(); await waitForSave(page);
  await expect(page.getByRole('columnheader')).toHaveText(warframeHeaders);
  expect(JSON.stringify(await account.inventory())).toBe(before);
});

test('column picker supports keyboard toggles and fits narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/'); await waitForSave(page);
  const trigger = page.getByRole('button', { name: 'Columns', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const columns = page.getByRole('group', { name: 'Table columns' });
  await expect(columns.getByRole('checkbox', { name: 'Owned', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(columns.getByRole('checkbox', { name: 'Rank', exact: true })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Rank column options', exact: true })).toHaveCount(0);
  await expect(columns).toBeVisible();
  const bounds = await columns.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);
  await columns.getByRole('button', { name: 'Reset to default' }).click();
  await expect(page.getByRole('button', { name: 'Rank column options', exact: true })).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(columns).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('column context menus sort by multiple priorities and add or hide columns', async ({ page, account }) => {
  await page.goto('/'); await waitForSave(page);
  await page.getByRole('button', { name: 'Edit Anku', exact: true }).waitFor();
  const inventory = await account.inventory();
  const ranks: Record<string, number> = { Anku: 30, 'Arca Titron': 30, Atomos: 20, Bo: 20 };
  inventory.items = inventory.items.filter((item: { name: string }) => item.name in ranks).map((item: { name: string }) => ({ ...item, owned: true, rank: ranks[item.name], mastered: ['Anku', 'Bo'].includes(item.name) }));
  await account.setInventory(inventory);
  await waitForSave(page); await page.reload(); await waitForSave(page);
  const saved = JSON.stringify(await account.inventory());
  const names = page.locator('.inventory-table .equipment-label');
  const menu = page.getByRole('group', { name: /Column actions for/ });
  await page.getByRole('button', { name: 'Mastered column options', exact: true }).click();
  await menu.getByRole('menuitemradio', { name: 'Sort descending', exact: true }).click();
  await page.getByRole('button', { name: 'Rank column options', exact: true }).click({ button: 'right' });
  await menu.getByRole('menuitemradio', { name: 'Sort descending', exact: true }).click();
  await expect(names).toHaveText(['Anku', 'Bo', 'Arca Titron', 'Atomos']);
  await expect(page.getByRole('button', { name: 'Rank column options', exact: true })).toHaveAccessibleDescription('Sort priority 2 of 2, descending');
  await page.getByRole('button', { name: 'Rank column options', exact: true }).press('Shift+F10');
  await menu.getByRole('menuitem', { name: /^Sort priority/ }).click();
  await menu.getByRole('menuitemradio').first().click();
  await expect(names).toHaveText(['Anku', 'Arca Titron', 'Bo', 'Atomos']);
  await expect(page.getByRole('button', { name: 'Rank column options', exact: true })).toHaveAccessibleDescription('Sort priority 1 of 2, descending');
  await page.getByRole('button', { name: 'Mastered column options', exact: true }).click({ button: 'right' });
  await menu.getByRole('menuitemradio', { name: 'Sort ascending', exact: true }).click();
  await expect(names).toHaveText(['Arca Titron', 'Anku', 'Atomos', 'Bo']);
  await expect(page.getByRole('button', { name: 'Mastered column options', exact: true })).toHaveAccessibleDescription('Sort priority 2 of 2, ascending');
  await page.getByRole('button', { name: 'Rank column options', exact: true }).click({ button: 'right' });
  await menu.getByRole('menuitemradio', { name: 'Sort descending', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mastered column options', exact: true })).toHaveAccessibleDescription('Sort priority 1 of 1, ascending');
  await page.getByRole('button', { name: 'Mastered column options', exact: true }).click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Hide column', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Mastered column options', exact: true })).toHaveCount(0);
  await expect(page.locator('th[aria-sort]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Weapon column options', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+F10');
  await expect(menu.getByRole('menuitem', { name: 'Hide column', exact: true })).toBeDisabled();
  await menu.getByRole('menuitem', { name: 'Add or remove columns' }).click();
  const columns = page.getByRole('group', { name: 'Table columns' });
  await columns.getByRole('checkbox', { name: 'Mastered', exact: true }).check();
  await columns.getByRole('checkbox', { name: 'Notes', exact: true }).check();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Notes column options', exact: true })).toHaveCount(1);
  expect(JSON.stringify(await account.inventory())).toBe(saved);
});

test('column filters combine, survive hiding their column, and coordinate with weapon filters', async ({ page }) => {
  await page.goto('/'); await waitForSave(page);
  const menu = page.getByRole('group', { name: /Column actions for/ });
  const names = page.locator('.inventory-table .equipment-label');
  await page.getByRole('button', { name: 'Weapon column options', exact: true }).click({ button: 'right' });
  await page.getByRole('textbox', { name: 'Weapon contains' }).fill('Boltor');
  await page.getByRole('button', { name: 'Apply filter', exact: true }).click();
  await expect(names).toHaveText(['Boltor']);
  await page.getByRole('button', { name: 'Owned column options', exact: true }).click({ button: 'right' });
  await chooseOption(page, 'Owned filter value', 'No');
  await page.getByRole('button', { name: 'Apply filter', exact: true }).click();
  await expect(names).toHaveText(['Boltor Prime', 'Telos Boltor']);
  await page.getByRole('button', { name: 'Owned column options', exact: true }).click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'Hide column' }).click();
  await expect(page.getByRole('group', { name: 'Column filters', exact: true })).toContainText('Owned: No');
  await expect(names).toHaveText(['Boltor Prime', 'Telos Boltor']);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Owned only', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Remove Owned filter' })).toHaveCount(0);
  await expect(names).toHaveText(['Boltor']);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await page.getByRole('button', { name: 'Rank column options', exact: true }).click({ button: 'right' });
  const rank = menu.getByRole('spinbutton', { name: 'Filter rank' });
  await rank.fill('39');
  await rank.press('ArrowUp');
  await expect(rank).toHaveValue('40');
  await expect(rank).toBeFocused();
  await page.getByRole('button', { name: 'Apply filter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No matching weapons' })).toBeVisible();
  await page.getByRole('button', { name: 'Rank: Equals 40', exact: true }).click();
  await chooseOption(page, 'Rank condition', 'Unknown');
  await page.getByRole('button', { name: 'Apply filter', exact: true }).click();
  await expect(names).toHaveCount(30);
  await page.getByRole('button', { name: 'Rank column options', exact: true }).click();
  await expect(menu.getByRole('combobox', { name: 'Rank condition' })).toHaveText('Unknown');
  await menu.getByRole('button', { name: 'Clear filter' }).click();
  await expect(page.getByRole('button', { name: 'Remove Rank filter' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Incarnon column options', exact: true }).click({ button: 'right' });
  await chooseOption(page, 'Incarnon filter value', 'Genesis compatible');
  await page.getByRole('button', { name: 'Apply filter', exact: true }).click();
  await expect(names).not.toHaveCount(30);
  await expect(page.getByRole('button', { name: 'Edit Boltor', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Arca Titron', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(names).toHaveCount(30);
  await expect(page.getByRole('group', { name: 'Column filters', exact: true })).toHaveCount(0);
});

test('left-click, right-click, and keyboard activation open the same column menu without sorting', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/'); await waitForSave(page);
  const header = page.getByRole('button', { name: 'Weapon column options', exact: true });
  const menu = page.getByRole('group', { name: 'Column actions for Weapon' });
  const names = page.locator('.inventory-table .equipment-label');
  const initialNames = await names.allTextContents();
  for (const activation of ['left', 'right', 'Enter', 'Space', 'Shift+F10']) {
    if (activation === 'left' || activation === 'right') await header.click({ button: activation });
    else await header.press(activation);
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitemradio')).toHaveText(['Sort ascending', 'Sort descending']);
    await expect(menu.getByRole('textbox', { name: /contains$/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Add or remove columns', exact: true })).toBeVisible();
    await expect(header).toHaveAttribute('aria-expanded', 'true');
    await expect(names).toHaveText(initialNames);
    await expect(page.locator('th[aria-sort]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(header).toBeFocused();
    await expect(header).toHaveAttribute('aria-expanded', 'false');
  }
  // The whole header opens the menu, including the space beside its label.
  await page.getByRole('columnheader').first().click({ position: { x: 4, y: 4 } });
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await header.focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu.getByRole('menuitemradio', { name: 'Sort ascending' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitemradio', { name: 'Sort descending' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitemradio', { name: 'Sort descending' })).toBeFocused();
  await page.keyboard.press('Tab');
  const contains = menu.getByRole('textbox', { name: 'Weapon contains' });
  await expect(contains).toBeFocused();
  await contains.fill('no matches');
  await contains.press('Home');
  await contains.press('Delete');
  await expect(contains).toHaveValue('o matches');
  await contains.press('End');
  await contains.press('Backspace');
  await expect(contains).toHaveValue('o matche');
  await expect(contains).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('button', { name: 'Apply filter' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('menuitem', { name: 'Move right' })).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Add or remove columns' })).toBeFocused();
  const bounds = await menu.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);
  await page.keyboard.press('Escape');
  await expect(header).toBeFocused();
  await expect(header).toHaveAccessibleDescription('Unsorted');
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(30);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('real local OCR reads an image and merges reviewed imports without losing notes', async ({ page, account }) => {
  await page.goto('/'); await waitForSave(page);
  const dataUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 700;
    const context = canvas.getContext('2d')!; context.fillStyle = '#181e23'; context.fillRect(0, 0, 1400, 700);
    context.fillStyle = '#ffffff'; context.font = '36px Arial';
    ['BRATON PRIME RANK 30', 'BOLTOR MASTERED', 'WISP PRIME UNRANKED', 'LEX PRIME BLUEPRINT'].forEach((line, index) => context.fillText(line, 100, 130 + index * 130));
    return canvas.toDataURL('image/png');
  });
  await page.getByRole('button', { name: 'Edit Boltor', exact: true }).click();
  await page.getByRole('tab', { name: 'My inventory' }).click();
  await page.getByLabel('Notes', { exact: true }).fill('Important crafting note');
  await chooseOption(page, 'Incarnon adapter installed', 'Yes');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('link', { name: 'Warframes', exact: true }).click();
  await page.getByRole('button', { name: 'Import screenshots', exact: true }).click();
  const savedBeforeReview = JSON.stringify(await account.inventory());
  const externalRequests: string[] = [];
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5173')) externalRequests.push(request.url()); });
  await page.getByLabel('Choose inventory screenshots').setInputFiles({ name: 'inventory-test.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await expect(page.getByRole('heading', { name: 'Review matches' })).toBeVisible({ timeout: 60000 });
  await expect(page.getByLabel('Import Braton Prime', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Import Wisp Prime', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Mastered: Braton Prime', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Mastered: Boltor', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Import Lex Prime', { exact: true })).toHaveCount(0);
  await expect(page.locator('select')).toHaveCount(0);
  const matchedName = page.getByRole('combobox', { name: 'Matched name for BRATON PRIME RANK 30', exact: true });
  await matchedName.click();
  const matchesMenu = page.getByRole('listbox', { name: 'Matched name for BRATON PRIME RANK 30', exact: true });
  await expect(matchesMenu.getByRole('option')).toHaveCount(805);
  await page.keyboard.press('End');
  await expect(matchesMenu.getByRole('option').last()).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(matchedName).toHaveText('Braton Prime');
  await page.keyboard.type('braton vandal');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Import Braton Vandal', { exact: true })).toBeChecked();
  await chooseOption(page, 'Matched name for BRATON PRIME RANK 30', 'Braton Prime');
  await page.getByLabel('Rank: Braton Prime', { exact: true }).fill('0');
  await expect(page.getByLabel('Mastered: Braton Prime', { exact: true })).not.toBeChecked();
  await page.getByLabel('Rank: Braton Prime', { exact: true }).fill('30');
  await expect(page.getByLabel('Mastered: Braton Prime', { exact: true })).toBeChecked();
  await chooseOption(page, 'Matched name for BRATON PRIME RANK 30', 'Paracesis');
  await expect(page.getByLabel('Mastered: Paracesis', { exact: true })).not.toBeChecked();
  await page.getByLabel('Rank: Paracesis', { exact: true }).fill('40');
  await expect(page.getByLabel('Mastered: Paracesis', { exact: true })).toBeChecked();
  await page.getByLabel('Mastered: Paracesis', { exact: true }).uncheck();
  await page.getByLabel('Rank: Paracesis', { exact: true }).fill('30');
  await chooseOption(page, 'Matched name for BRATON PRIME RANK 30', 'Braton Prime');
  await expect(page.getByLabel('Mastered: Braton Prime', { exact: true })).not.toBeChecked();
  await page.getByLabel('Mastered: Braton Prime', { exact: true }).check();
  expect(JSON.stringify(await account.inventory())).toBe(savedBeforeReview);
  await page.getByRole('button', { name: 'Deselect all' }).click();
  await expect(page.getByRole('button', { name: 'Import 0 items' })).toBeDisabled();
  await page.getByRole('button', { name: 'Select all' }).click();
  await expect(page.getByRole('img', { name: 'Import source: inventory-test.png' })).toBeVisible();
  await expect(page.locator('.import-preview summary')).toHaveCount(0);
  const thumbnail = page.getByRole('button', { name: 'View screenshot 1: inventory-test.png', exact: true });
  await thumbnail.click();
  const galleryDialog = page.getByRole('dialog', { name: 'Screenshot gallery', exact: true });
  await expect(galleryDialog.getByRole('img')).toHaveJSProperty('naturalWidth', 1400);
  await expect(galleryDialog.getByRole('button', { name: 'Previous screenshot' })).toBeDisabled();
  await expect(galleryDialog.getByRole('button', { name: 'Next screenshot' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(thumbnail).toBeFocused();
  await page.screenshot({ path: 'test-results/import-review.png', fullPage: true });
  await page.getByRole('button', { name: 'Import 3 items' }).click();
  await expectImportFinished(page);
  expect((await account.inventory()).imports[0]).toMatchObject({ added: 1, updated: 2 });
  await page.getByRole('button', { name: 'Edit Boltor', exact: true }).click();
  await page.getByRole('tab', { name: 'My inventory' }).click();
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue('Important crafting note');
  await expect(page.getByRole('combobox', { name: 'Incarnon adapter installed', exact: true })).toHaveText('Yes');
  expect(externalRequests).toEqual([]);
});

test('navigation, dialogs, and tables fit narrow screens and support keyboard use', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await waitForSave(page);
  await expect(page.getByRole('region', { name: 'Weapons', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Warframes' }).click();
  await expect(page.getByRole('region', { name: 'Warframes', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Weapons' }).click();
  await expect(page.getByRole('region', { name: 'Weapons', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open search and commands' }).click();
  await page.getByRole('option', { name: 'Jump to…', exact: true }).click();
  await page.getByRole('option', { name: 'Warframes', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Warframes', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Open search and commands' }).click();
  await page.getByRole('combobox', { name: 'Search commands' }).fill('Add Warframe');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Add Warframe' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Relics', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Relics', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Add relic', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Add relic' })).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Add relic', exact: true })).toBeFocused();
});

test('dropdowns support keyboard selection and relic suggestions preserve manual entry', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await waitForSave(page);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByLabel('Filter by slot').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Filter by slot')).toHaveText('Amp');
  await page.getByRole('link', { name: 'Relics', exact: true }).click();
  await page.getByRole('button', { name: 'Add relic', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add relic' });
  const name = dialog.getByRole('combobox', { name: 'Relic name', exact: true });
  await name.fill('Lith A');
  await name.press('ArrowDown');
  await name.press('ArrowDown');
  await expect(page.getByRole('listbox', { name: 'Matching relics' }).getByRole('option', { selected: true })).toHaveText('Lith A2');
  await name.press('Enter');
  await expect(name).toHaveValue('Lith A2');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await name.fill('Lith A');
  await page.getByRole('option', { name: 'Lith A3', exact: true }).click();
  await expect(name).toHaveValue('Lith A3');
  await name.fill('Lith A');
  await name.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(name).toHaveValue('Lith A');
  await page.setViewportSize({ width: 320, height: 720 });
  await name.click();
  await name.press('ArrowUp');
  const suggestions = page.getByRole('listbox', { name: 'Matching relics' });
  await expect(suggestions.getByRole('option').last()).toHaveAttribute('aria-selected', 'true');
  await expect(suggestions.getByRole('option').last()).toBeInViewport();
  const bounds = await suggestions.boundingBox();
  expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320 && bounds.y >= 0 && bounds.y + bounds.height <= 720).toBe(true);
  await name.press('Tab');
  await expect(suggestions).toHaveCount(0);
  await name.fill('Lith ZZ999');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  const refinement = dialog.getByRole('combobox', { name: 'Refinement', exact: true });
  await refinement.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(refinement).toHaveText('Exceptional');
  await refinement.click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Add relic', exact: true }).click();
  await waitForSave(page); await page.reload(); await waitForSave(page);
  await expect(page.getByRole('button', { name: 'Edit Lith ZZ999 Exceptional', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('custom dropdowns cancel changes, follow focus, and fit dialogs in both themes', async ({ page }) => {
  await page.goto('/'); await waitForSave(page);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(page.locator('select')).toHaveCount(0);
  const slot = page.getByRole('combobox', { name: 'Filter by slot', exact: true });
  await slot.click();
  const menu = page.getByRole('listbox', { name: 'Filter by slot', exact: true });
  await expect(menu).toBeVisible();
  await page.keyboard.press('End');
  await expect(menu.getByRole('option', { name: 'Secondary', exact: true })).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(slot).toHaveText('All slots');
  await expect(slot).toBeFocused();
  await page.keyboard.type('secondary');
  await page.keyboard.press('Enter');
  await expect(slot).toHaveText('Secondary');
  await page.keyboard.press('Home');
  await page.keyboard.press('Tab');
  await expect(slot).toHaveText('All slots');
  const incarnon = page.getByRole('combobox', { name: 'Incarnon filter', exact: true });
  await expect(incarnon).toBeFocused();
  await incarnon.click();
  await page.keyboard.press('End');
  await page.getByLabel('Search weapons').click();
  await expect(incarnon).toHaveText('Any Incarnon status');
  await expect(page.getByRole('listbox')).toHaveCount(0);

  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole('button', { name: 'Add weapon', exact: true }).click();
  await expect(page.locator('select')).toHaveCount(0);
  const variant = page.getByRole('combobox', { name: 'Variant', exact: true });
  await variant.click();
  const variants = page.getByRole('listbox', { name: 'Variant', exact: true });
  await expect(variants).toBeVisible();
  const bounds = await variants.boundingBox();
  expect(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 320 && bounds.y >= 0 && bounds.y + bounds.height <= 720).toBe(true);
  await page.keyboard.press('End');
  await expect(variants.getByRole('option').last()).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(variant).toBeFocused();
  await chooseOption(page, 'Variant', 'Prime');
  await expect(variant).toHaveText('Prime');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('relic refinements and quantity edits persist without changing an older equipment save', async ({ page, account }) => {
  await page.goto('/'); await waitForSave(page);
  const oldSave = await account.inventory();
  const originalItems = oldSave.items;
  delete (oldSave as Partial<Inventory>).relics;
  await account.setInventory(oldSave);
  await waitForSave(page); await page.reload(); await waitForSave(page);
  await page.getByRole('link', { name: 'Relics', exact: true }).click();
  await expect(page.getByText('No relics added.', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Add relic', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Add relic' });
  await dialog.getByLabel('Relic name').fill('lith a1');
  await dialog.getByLabel('Quantity').fill('3');
  await dialog.getByLabel('Notes', { exact: true }).fill('Save for a group');
  await dialog.getByRole('button', { name: 'Add relic', exact: true }).click();
  await page.getByRole('button', { name: 'Increase Lith A1 Intact quantity' }).click();
  await waitForSave(page); await page.reload(); await waitForSave(page);
  await expect(page.getByLabel('Lith A1 Intact quantity', { exact: true })).toHaveText('4');
  await expect(page.getByText('Save for a group', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Add relic', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Add relic' });
  await dialog.getByLabel('Relic name').fill('Lith A1');
  await dialog.getByLabel('Relic name').press('Tab');
  await chooseOption(page, 'Refinement', 'Radiant');
  await dialog.getByLabel('Quantity').fill('2');
  await dialog.getByRole('button', { name: 'Add relic', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Relics', exact: true }).getByRole('status')).toHaveText('2 of 2 stacks · 6 relics');

  await page.getByRole('button', { name: 'Add relic', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Add relic' });
  await dialog.getByLabel('Relic name').fill('LITH A1 relic');
  await dialog.getByRole('button', { name: 'Add relic', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('already tracked');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await chooseOption(page, 'Filter by refinement', 'Radiant');
  await expect(page.getByRole('button', { name: 'Edit Lith A1 Intact' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit Lith A1 Radiant' })).toBeVisible();
  await chooseOption(page, 'Filter by era', 'Axi');
  await expect(page.getByText('No matching relics.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();

  await page.getByRole('button', { name: 'Edit Lith A1 Intact' }).click();
  await page.getByRole('dialog').getByLabel('Quantity').fill('0');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('button', { name: 'Decrease Lith A1 Intact quantity' })).toBeDisabled();
  await page.getByLabel('Owned only').check();
  await expect(page.getByRole('button', { name: 'Edit Lith A1 Intact' })).toHaveCount(0);
  await page.getByLabel('Owned only').uncheck();
  await page.getByRole('button', { name: 'Decrease Lith A1 Radiant quantity' }).click();
  await waitForSave(page); await page.reload(); await waitForSave(page);
  await expect(page.getByLabel('Lith A1 Intact quantity', { exact: true })).toHaveText('0');
  await expect(page.getByLabel('Lith A1 Radiant quantity', { exact: true })).toHaveText('1');
  expect((await account.inventory()).items).toEqual(originalItems);
});

test('relic CSV exports records and deletions persist without changing equipment', async ({ page, account }) => {
  await page.goto('/#relics'); await waitForSave(page);
  await expect(page.getByText('No relics added.', { exact: true })).toBeVisible();
  const originalItems = (await account.inventory()).items;
  await page.getByRole('button', { name: 'Add relic', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add relic' });
  await dialog.getByLabel('Relic name').fill('Neo N1');
  await dialog.getByLabel('Relic name').press('Tab');
  await chooseOption(page, 'Refinement', 'Flawless');
  await dialog.getByLabel('Quantity').fill('5');
  await dialog.getByRole('button', { name: 'Add relic', exact: true }).click();
  const csvPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const csv = await csvPromise;
  expect(csv.suggestedFilename()).toMatch(/^grakata-relics-.*\.csv$/);
  expect(await readFile((await csv.path())!, 'utf8')).toContain('"Neo N1","Neo","Flawless","5"');
  await page.getByRole('button', { name: 'Edit Neo N1 Flawless' }).click();
  await page.getByRole('button', { name: 'Remove entry', exact: true }).click();
  await page.getByRole('button', { name: 'Remove relic', exact: true }).click();
  await expect(page.getByText('No relics added.', { exact: true })).toBeVisible();
  await waitForSave(page); await page.reload(); await waitForSave(page);
  await expect(page.getByText('No relics added.', { exact: true })).toBeVisible();
  const saved = await account.inventory();
  expect(saved.relics).toEqual([]);
  expect(saved.items).toEqual(originalItems);
});

test('old backups links open weapons without changing saved data and CSV still exports', async ({ page, account }) => {
  await page.goto('/'); await waitForSave(page);
  await expect(page.getByRole('region', { name: 'Weapons', exact: true })).toBeVisible();
  const saved = JSON.stringify(await account.inventory());
  await page.goto('/#backups'); await waitForSave(page);
  await expect(page.getByRole('region', { name: 'Weapons', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Data & backups' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open search and commands' }).click();
  await page.getByRole('option', { name: 'Jump to…', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Data & backups', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^grakata-inventory-.*\.csv$/);
  expect(await readFile((await download.path())!, 'utf8')).toContain('"Boltor"');
  expect(JSON.stringify(await account.inventory())).toBe(saved);
});

test('Alt number shortcuts follow the top tabs and stay inactive while editing', async ({ page }) => {
  const drops = parseDropTables(await readFile(new URL('../fixtures/drop-tables.html', import.meta.url), 'utf8'));
  await page.route('**/api/droptables', route => route.fulfill({ json: drops }));
  await page.goto('/#import'); await waitForSave(page);
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  const tabs = ['Weapons', 'Warframes', 'Relics', 'Drop Tables'];
  await expect(navigation.getByRole('link')).toHaveText(tabs);
  for (const [index, name] of tabs.entries()) {
    await page.keyboard.press(`Alt+${index + 1}`);
    await expect(page).toHaveURL(new RegExp(`#${name.toLowerCase().replaceAll(' ', '')}(?:\\?|$)`));
    await expect(navigation.getByRole('link', { name, exact: true })).toHaveAttribute('aria-current', 'page');
  }
  await page.keyboard.press('Alt+1');
  await expect(page.getByRole('region', { name: 'Weapons', exact: true })).toBeVisible();
  await page.getByLabel('Search weapons').focus();
  await page.keyboard.press('Alt+2');
  await expect(page).toHaveURL(/#weapons$/);
  await page.getByRole('button', { name: 'Add weapon', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).focus();
  await page.keyboard.press('Alt+3');
  await expect(page.getByRole('dialog', { name: 'Add weapon' })).toBeVisible();
  await expect(page).toHaveURL(/#weapons$/);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+i');
  await expect(page).toHaveURL(/#import$/);
  await page.getByRole('button', { name: 'Open search and commands' }).click();
  await page.getByRole('option', { name: 'Jump to…', exact: true }).click();
  for (const [index, name] of tabs.entries()) {
    const option = page.getByRole('option', { name, exact: true });
    await expect(option.locator('kbd')).toHaveText(['Alt', String(index + 1)]);
  }
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Open search and commands' }).click();
  await page.getByRole('option', { name: 'Keyboard shortcuts', exact: true }).click();
  const shortcuts = page.getByRole('dialog', { name: 'Keyboard shortcuts', exact: true });
  for (const [index, name] of tabs.entries()) {
    const entry = shortcuts.locator('.shortcut-list > div').filter({ has: page.getByText(name, { exact: true }) });
    await expect(entry.locator('kbd')).toHaveText(['Alt', String(index + 1)]);
  }
  await expect(shortcuts).not.toContainText('Data & backups');
});

test('screenshot instructions show the local example and fit desktop and mobile', async ({ page, account }) => {
  await page.goto('/#import'); await waitForSave(page);
  const inventory = page.getByRole('region', { name: 'Inventory', exact: true });
  const codex = page.getByRole('region', { name: 'Codex', exact: true });
  await expect(inventory).toBeVisible();
  await expect(codex).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Import screenshots', exact: true })).toHaveCount(0);
  for (const [section, source] of [[inventory, 'inventory'], [codex, 'codex']] as const) {
    const example = section.getByRole('img', { name: /Example Warframe/ });
    await expect(example).toBeVisible();
    await expect(example).toHaveAttribute('src', `/images/import/${source}-weapons.png`);
    await expect(example).toHaveJSProperty('naturalWidth', 1920);
  }
  const saved = JSON.stringify(await account.inventory());
  const instructions = inventory.getByRole('button', { name: 'Inventory instructions' });
  await instructions.click();
  const guide = page.getByRole('dialog', { name: 'Inventory screenshots', exact: true });
  const example = guide.getByRole('img', { name: /Warframe Inventory\/Sell screen/ });
  await expect(example).toBeVisible();
  await expect(example).toHaveJSProperty('naturalWidth', 1920);
  await expect(example).toHaveJSProperty('naturalHeight', 1200);
  await expect(guide.getByRole('link', { name: 'Open full-size example' })).toHaveAttribute('href', '/images/import/inventory-weapons.png');
  await expect(guide.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  expect(await guide.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(guide.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.screenshot({ path: 'test-results/inventory-instructions-desktop.png' });
  await page.keyboard.press('Escape');
  await expect(instructions).toBeFocused();

  await codex.getByRole('button', { name: 'Codex instructions' }).click();
  const codexGuide = page.getByRole('dialog', { name: 'Codex screenshots', exact: true });
  await expect(codexGuide).toContainText('Owned starts unchecked');
  await expect(codexGuide.getByRole('img', { name: /Warframe Codex weapon grid/ })).toHaveJSProperty('naturalWidth', 1920);
  await expect(codexGuide.getByRole('link', { name: 'Open full-size example' })).toHaveAttribute('href', '/images/import/codex-weapons.png');
  await page.mouse.click(1, 1);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(codex.getByRole('button', { name: 'Codex instructions' })).toBeFocused();
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await instructions.click();
  await expect(example).toBeVisible();
  expect(await guide.evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/inventory-instructions-mobile.png' });
  await guide.getByRole('button', { name: 'Close instructions', exact: true }).click();
  await expect(instructions).toBeFocused();
  expect(JSON.stringify(await account.inventory())).toBe(saved);
  await expect(page.getByRole('list', { name: 'Screenshot previews' })).toHaveCount(0);
});

test('pointer highlights the paste destination and a batch hides the other source', async ({ page, context, browserName }) => {
  await page.goto('/#import'); await waitForSave(page);
  const screenshot = await equipmentScreenshot(page, 'paste.png', ['BOLTOR [30]']);
  const base64 = screenshot.buffer.toString('base64');
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.evaluate(async data => {
      const image = new Blob([Uint8Array.from(atob(data), character => character.charCodeAt(0))], { type: 'image/png' });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })]);
    }, base64);
  }
  const pasteImage = async () => {
    if (browserName === 'chromium') await page.keyboard.press('Control+v');
    else await page.evaluate(data => {
      // Firefox does not expose clipboard-write permission to Playwright.
      const clipboard = new DataTransfer();
      clipboard.items.add(new File([Uint8Array.from(atob(data), character => character.charCodeAt(0))], 'paste.png', { type: 'image/png' }));
      const paste = new Event('paste', { bubbles: true, cancelable: true });
      Object.defineProperty(paste, 'clipboardData', { value: clipboard });
      document.activeElement!.dispatchEvent(paste);
    }, base64);
  };
  const inventory = page.getByRole('region', { name: 'Inventory', exact: true });
  const codex = page.getByRole('region', { name: 'Codex', exact: true });
  const inventoryUpload = inventory.getByRole('button', { name: /^Drag and drop or Ctrl\+V to paste\. Or click to open file browser/ });
  const codexUpload = codex.getByRole('button', { name: /^Drag and drop or Ctrl\+V to paste\. Or click to open file browser/ });
  await inventoryUpload.focus();
  await expect(inventory).toHaveAccessibleDescription('Selected for screenshot paste');
  // Moving through blank page space changes the destination without a click,
  // even when a control in the other section still has keyboard focus.
  await page.mouse.move(1200, 650);
  await expect(codex).toHaveAccessibleDescription('Selected for screenshot paste');
  await expect(inventoryUpload).toBeFocused();
  await expect(page.locator('.is-paste-target')).toHaveCount(1);
  await expect.poll(async () => (await inventory.boundingBox())!.x).toBeLessThan(-40);
  const stage = page.locator('.import-sources');
  expect((await codex.boundingBox())!.height).toBe((await stage.boundingBox())!.height);
  expect(await codex.evaluate(panel => getComputedStyle(panel).borderTopWidth)).toBe('0px');
  expect(await codexUpload.evaluate(button => getComputedStyle(button).borderTopWidth)).toBe('0px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/import-paste-target-desktop.png', fullPage: true });
  await pasteImage();
  await expect(inventory).toHaveCount(0);
  await expect(codex.getByRole('list', { name: 'Screenshot previews' }).getByRole('img')).toHaveCount(1);
  await expect(page.locator('.import-source.is-exiting')).toHaveCount(0);
  await expect(page.locator('.import-source-example')).toHaveCount(0);
  // Removing the outgoing source does not guarantee the width transition has finished.
  await expect.poll(async () => (await codex.boundingBox())!.width - (await stage.boundingBox())!.width).toBe(0);
  await waitForScreenshotReview(page);
  await expect(codex.getByLabel('Owned: Boltor', { exact: true })).not.toBeChecked();
  // Once a batch starts, moving to the other side keeps pastes in that batch.
  await page.mouse.move(40, 650);
  await pasteImage();
  await expect(codex.getByRole('list', { name: 'Screenshot previews' }).getByRole('img')).toHaveCount(2);
  await expect(inventory).toHaveCount(0);
  await waitForScreenshotReview(page);
  await page.getByRole('button', { name: 'Import 1 item', exact: true }).click();
  await expectImportFinished(page);
  await expect(inventory).toHaveCount(0);
  await page.getByRole('button', { name: 'Import screenshots', exact: true }).click();
  await expect(inventory).toBeVisible();
  await expect(codex).toBeVisible();
  await page.setViewportSize({ width: 320, height: 720 });
  await inventory.hover({ position: { x: 80, y: 12 } });
  await expect(inventory).toHaveAccessibleDescription('Selected for screenshot paste');
  await codex.hover({ position: { x: 80, y: 12 } });
  await expect(codex).toHaveAccessibleDescription('Selected for screenshot paste');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/import-paste-target-mobile.png', fullPage: true });
  await inventoryUpload.focus();
  await expect(inventory).toHaveAccessibleDescription('Selected for screenshot paste');
  await codexUpload.focus();
  await expect(codex).toHaveAccessibleDescription('Selected for screenshot paste');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.mouse.move(40, 650);
  await expect(inventory).toHaveAccessibleDescription('Selected for screenshot paste');
  await pasteImage();
  await expect(codex).toHaveCount(0);
  await waitForScreenshotReview(page);
  await expect(inventory.getByLabel('Owned: Boltor', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(inventory).toBeVisible();
  await expect(codex).toBeVisible();
});

test('real Codex OCR reads exact variants and mastery, preserving ownership, ranks, and review edits', async ({ page, account }) => {
  const externalRequests: string[] = [];
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5173')) externalRequests.push(request.url()); });
  await page.goto('/#import'); await waitForSave(page);
  await expect(page.getByRole('region', { name: 'Codex', exact: true })).toBeVisible();
  const original = await account.inventory();
  Object.assign(original.items.find(item => item.name === 'Boltor')!, { owned: true, mastered: false, rank: 7, notes: 'Keep this Forma plan', dontKeep: true, override: 'Keep' });
  await account.setInventory(original);
  await waitForSave(page); await page.reload(); await waitForSave(page);
  await page.getByLabel('Choose codex screenshots').setInputFiles(codexScreenshot.file);
  await waitForScreenshotReview(page);
  const names = await page.locator('.review-table [role="combobox"]').allTextContents();
  expect(names.sort()).toEqual(Object.keys(codexScreenshot.weapons).sort());
  await expect(page.getByRole('region', { name: 'Inventory', exact: true })).toHaveCount(0);
  for (const [name, mastered] of Object.entries(codexScreenshot.weapons)) {
    await expect(page.getByLabel(`Import ${name}`, { exact: true })).toBeChecked();
    await expect(page.getByLabel(`Mastered: ${name}`, { exact: true })).toBeChecked({ checked: mastered });
    await expect(page.getByLabel(`Owned: ${name}`, { exact: true })).not.toBeChecked();
    await expect(page.getByLabel(`Rank: ${name}`, { exact: true })).toHaveValue('');
  }
  expect(await account.inventory()).toEqual(original);
  await page.getByLabel('Mastered: Afuris', { exact: true }).uncheck();
  await page.getByLabel('Choose codex screenshots').setInputFiles(codexScreenshot.file);
  await waitForScreenshotReview(page);
  await expect(page.getByRole('list', { name: 'Screenshot previews' }).getByRole('img')).toHaveCount(2);
  await expect(page.getByLabel('Mastered: Afuris', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Import 32 items', exact: true }).click();
  await expectImportFinished(page);
  const saved: Inventory = await account.inventory();
  const boltor = saved.items.find(item => item.name === 'Boltor')!;
  expect(boltor).toMatchObject({ owned: true, mastered: true, rank: 7, notes: 'Keep this Forma plan', dontKeep: true, override: 'Keep' });
  for (const old of original.items) {
    const next = saved.items.find(item => item.id === old.id)!;
    expect(next).toEqual(Object.hasOwn(codexScreenshot.weapons, old.name)
      ? { ...old, mastered: true, source: next.source, updatedAt: next.updatedAt } : old);
  }
  for (const name of names.filter(name => !original.items.some(item => item.name === name))) {
    expect(saved.items.find(item => item.name === name)).toMatchObject({ owned: false, rank: null, mastered: name !== 'Afuris' });
  }
  expect(externalRequests).toEqual([]);
});

test('resized Codex images keep badges tied to cards and reject missing badges and green blocks', async ({ page }) => {
  await page.goto('/#import'); await waitForSave(page);
  const changed = await page.evaluate(async () => {
    const bitmap = await createImageBitmap(await (await fetch('/images/import/codex-weapons.png')).blob());
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0); bitmap.close();
    // Obscure Afuris's laurel and replace Akbolto's with a plain mint square.
    context.fillStyle = '#202427'; context.fillRect(236, 200, 42, 44);
    context.fillStyle = '#88e8c8'; context.fillRect(447, 200, 42, 44);
    const resized = document.createElement('canvas'); resized.width = 1500; resized.height = 960;
    const target = resized.getContext('2d')!; target.fillStyle = '#101418'; target.fillRect(0, 0, 1500, 960);
    target.drawImage(canvas, 30, 30, 1440, 900);
    return resized.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Choose codex screenshots').setInputFiles({ name: 'codex-resized.png', mimeType: 'image/png', buffer: Buffer.from(changed, 'base64') });
  await waitForScreenshotReview(page);
  expect((await page.locator('.review-table [role="combobox"]').allTextContents()).sort()).toEqual(Object.keys(codexScreenshot.weapons).sort());
  for (const name of Object.keys(codexScreenshot.weapons)) {
    await expect(page.getByLabel(`Mastered: ${name}`, { exact: true })).toBeChecked({ checked: !['Afuris', 'Akbolto'].includes(name) });
    await expect(page.getByLabel(`Rank: ${name}`, { exact: true })).toHaveValue('');
    await expect(page.getByLabel(`Owned: ${name}`, { exact: true })).not.toBeChecked();
  }
});

for (const fixture of inventoryScreenshots) test(`real Inventory OCR reads every name and rank: ${fixture.file}`, async ({ page, account }) => {
  const externalRequests: string[] = [];
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5173')) externalRequests.push(request.url()); });
  await page.goto('/#import'); await waitForSave(page);
  await expect(page.getByRole('region', { name: 'Import screenshots', exact: true })).toBeVisible();
  const saved = JSON.stringify(await account.inventory());
  await page.getByLabel('Choose inventory screenshots').setInputFiles(fixture.file);
  const inventory = page.getByRole('region', { name: 'Inventory', exact: true });
  const codex = page.getByRole('region', { name: 'Codex', exact: true });
  await expect(inventory.getByRole('heading', { name: 'Review matches' })).toBeVisible({ timeout: 60000 });
  await expect(codex).toHaveCount(0);
  const names = await inventory.locator('.review-table [role="combobox"]').allTextContents();
  expect(names.sort()).toEqual(Object.keys(fixture.weapons).sort());
  for (const [name, rank] of Object.entries(fixture.weapons)) {
    await expect(inventory.getByLabel(`Import ${name}`, { exact: true })).toBeChecked();
    await expect(inventory.getByLabel(`Owned: ${name}`, { exact: true })).toBeChecked();
    await expect(inventory.getByLabel(`Rank: ${name}`, { exact: true })).toHaveValue(String(rank));
    await expect(inventory.getByLabel(`Mastered: ${name}`, { exact: true })).toBeChecked({ checked: rank === 30 });
  }
  await inventory.getByRole('button', { name: 'Inventory instructions' }).click();
  await page.keyboard.press('Escape');
  await expect(inventory.getByRole('button', { name: `Import ${names.length} items`, exact: true })).toBeEnabled();
  expect(JSON.stringify(await account.inventory())).toBe(saved);
  expect(externalRequests).toEqual([]);
});

test('real screenshot batches merge duplicates and preserve planning, prior mastery, and absent equipment', async ({ page, account }) => {
  test.setTimeout(180000);
  await page.goto('/'); await waitForSave(page);
  await expect(page.getByRole('region', { name: 'Weapons', exact: true })).toBeVisible();
  const original = await account.inventory();
  original.items.push(createEquipment({ name: 'Vasto', slot: 'Secondary', variant: 'Base' }, { mastered: true, rank: 30, notes: 'Keep my crafting plan', dontKeep: true, override: 'Keep', upgraded: 'Yes' }));
  await account.setInventory(original);
  await waitForSave(page); await page.reload(); await waitForSave(page);
  await page.getByRole('button', { name: 'Import screenshots', exact: true }).click();
  await page.getByLabel('Choose inventory screenshots').setInputFiles(inventoryScreenshots[0].file);
  await waitForScreenshotReview(page);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /^Add screenshots/ }).click();
  await (await chooserPromise).setFiles(inventoryScreenshots[1].file);
  await expect(page.getByRole('button', { name: 'Cancel reading' })).toBeVisible();
  // Queue an overlapping image while the second one is still being read.
  await expect(page.getByRole('button', { name: /^Add screenshots/ })).toBeEnabled();
  await page.getByLabel('Choose inventory screenshots').setInputFiles(inventoryScreenshots[0].file);
  await expect(page.getByRole('list', { name: 'Screenshot previews' }).getByRole('img')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Review matches' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import 17 items', exact: true })).toBeDisabled();
  await waitForScreenshotReview(page);
  const expected = Object.assign({}, ...inventoryScreenshots.map(fixture => fixture.weapons)) as Record<string, number>;
  const names = await page.locator('.review-table [role="combobox"]').allTextContents();
  expect(names.sort()).toEqual(Object.keys(expected).sort());
  await expect(page.getByLabel('Rank: Vasto', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Mastered: Vasto', { exact: true })).not.toBeChecked();
  expect(await account.inventory()).toEqual(original);
  const gallery = page.getByRole('list', { name: 'Screenshot previews' });
  await expect(gallery.locator('figcaption')).toHaveText(['1. inventory-weapons.png', '2. inventory-weapons-bottom.png', '3. inventory-weapons.png']);
  const desktopImages = await gallery.getByRole('img').evaluateAll(images => images.map(image => {
    const { x, y, width } = image.getBoundingClientRect();
    return { x, y, width };
  }));
  expect(desktopImages[0].y).toBe(desktopImages[1].y);
  expect(desktopImages[1].x).toBeGreaterThan(desktopImages[0].x + desktopImages[0].width);
  await page.locator('.import-preview').screenshot({ path: 'test-results/import-gallery-desktop.png' });
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const image of await gallery.getByRole('img').all()) {
    await expect(image).toBeVisible();
    const bounds = await image.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  }
  await page.locator('.import-preview').screenshot({ path: 'test-results/import-gallery-mobile.png' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: 'Import 37 items', exact: true }).click();
  await expectImportFinished(page);
  await waitForSave(page); await page.reload(); await waitForSave(page);
  const saved: Inventory = await account.inventory();
  expect(saved.items.length).toBe(new Set([...original.items.map(item => item.name), ...Object.keys(expected)]).size);
  for (const [name, rank] of Object.entries(expected)) {
    expect(saved.items.filter(item => item.name === name)).toHaveLength(1);
    expect(saved.items.find(item => item.name === name)).toMatchObject({ rank, owned: true, mastered: true });
  }
  for (const before of original.items) {
    const after = saved.items.find(item => item.id === before.id)!;
    if (before.name in expected) expect(after).toEqual({ ...before, owned: true, mastered: true, rank: expected[before.name], source: after.source, updatedAt: after.updatedAt });
    else expect(after).toEqual(before);
  }
  expect(saved.imports).toHaveLength(original.imports.length + 1);
});

test('background reading keeps the list editable while paste and drop add screenshots', async ({ page, account }) => {
  await page.goto('/#import'); await waitForSave(page);
  const first = await equipmentScreenshot(page, 'first.png', ['BOLTOR [30]', 'BRATON PRIME [30]', 'VASTO [0]']);
  const later = await equipmentScreenshot(page, 'later.png', ['BOLTOR [30]', 'BRATON PRIME [30]', 'VASTO [30]', 'PARIS [30]']);
  const savedBefore = JSON.stringify(await account.inventory());
  await page.getByLabel('Choose inventory screenshots').setInputFiles(first);
  await waitForScreenshotReview(page);

  // Hold decoding so edits happen during a pending read regardless of CPU speed.
  // Releasing it runs the real OCR pipeline on both additional screenshots.
  const resume = await page.evaluateHandle(() => {
    const original = window.createImageBitmap.bind(window);
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    window.createImageBitmap = ((...args: Parameters<typeof createImageBitmap>) => pending.then(() => original(...args))) as typeof createImageBitmap;
    return () => { window.createImageBitmap = original; release(); };
  });

  const add = page.getByRole('button', { name: /^Add screenshots/ });
  const append = async (method: 'paste' | 'drop') => {
    await add.focus();
    await add.evaluate((target, { method, base64 }) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], `${method}.png`, { type: 'image/png' }));
      const event = new Event(method, { bubbles: true, cancelable: true });
      Object.defineProperty(event, method === 'paste' ? 'clipboardData' : 'dataTransfer', { value: transfer });
      target.dispatchEvent(event);
    }, { method, base64: later.buffer.toString('base64') });
  };
  await append('paste');
  await expect(page.getByRole('button', { name: 'Cancel reading' })).toBeVisible();
  await append('drop');
  await expect(add).toContainText('3/10 images');
  const gallery = page.getByRole('list', { name: 'Screenshot previews' });
  await expect(gallery.getByRole('img')).toHaveCount(3);
  await expect(gallery.locator('figcaption')).toHaveText(['1. first.png', '2. paste.png', '3. drop.png']);
  for (const filename of ['first.png', 'paste.png', 'drop.png']) {
    const image = gallery.getByRole('img', { name: `Import source: ${filename}`, exact: true });
    await expect(image).toBeVisible();
    await expect(image).toHaveJSProperty('naturalWidth', 1200);
  }
  await expect(page.getByRole('heading', { name: 'Review matches' })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Screenshot reading progress' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import 3 items', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Deselect all', exact: true }).click();
  await expect(page.getByLabel('Import Boltor', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByLabel('Import Boltor', { exact: true }).uncheck();
  await page.getByLabel('Owned: Boltor', { exact: true }).uncheck();
  await page.getByLabel('Rank: Boltor', { exact: true }).fill('12');
  await page.getByLabel('Mastered: Vasto', { exact: true }).check();
  await page.getByRole('combobox', { name: /^Matched name for BRATON PRIME/ }).click();
  await page.getByRole('option', { name: 'Braton Vandal', exact: true }).click();
  await page.getByLabel('Rank: Boltor', { exact: true }).focus();
  await expect(page.getByRole('button', { name: 'Import 2 items', exact: true })).toBeDisabled();
  expect(JSON.stringify(await account.inventory())).toBe(savedBefore);
  await page.screenshot({ path: 'test-results/import-background-reading.png', fullPage: true });
  await resume.evaluate(release => release());
  await resume.dispose();
  await waitForScreenshotReview(page);
  await expect(page.getByLabel('Rank: Boltor', { exact: true })).toBeFocused();
  expect((await page.locator('.review-table [role="combobox"]').allTextContents()).sort()).toEqual(['Boltor', 'Braton Vandal', 'Paris', 'Vasto']);
  await expect(page.getByLabel('Import Boltor', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Owned: Boltor', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Mastered: Boltor', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Rank: Boltor', { exact: true })).toHaveValue('12');
  await expect(page.getByLabel('Mastered: Vasto', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Rank: Vasto', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Import Paris', { exact: true })).toBeChecked();
  await expect(gallery.getByRole('img')).toHaveCount(3);
  const fullSize = gallery.getByRole('button', { name: 'View screenshot 3: drop.png', exact: true });
  await fullSize.focus();
  await page.keyboard.press('Enter');
  const galleryDialog = page.getByRole('dialog', { name: 'Screenshot gallery', exact: true });
  await expect(galleryDialog.getByRole('img', { name: 'Screenshot 3: drop.png', exact: true })).toHaveJSProperty('naturalWidth', 1200);
  await expect(galleryDialog.getByRole('status')).toContainText('3 of 3');
  await galleryDialog.getByRole('button', { name: 'Previous screenshot' }).click();
  await expect(galleryDialog.getByRole('img', { name: 'Screenshot 2: paste.png', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(galleryDialog.getByRole('img', { name: 'Screenshot 1: first.png', exact: true })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(galleryDialog.getByRole('status')).toContainText('3 of 3');
  await galleryDialog.getByRole('button', { name: 'Next screenshot' }).click();
  await expect(galleryDialog.getByRole('status')).toContainText('1 of 3');
  await page.keyboard.press('End');
  await expect(galleryDialog.getByRole('status')).toContainText('3 of 3');
  await page.keyboard.press('Home');
  await expect(galleryDialog.getByRole('status')).toContainText('1 of 3');
  await page.keyboard.press('ArrowRight');
  await expect(galleryDialog.getByRole('status')).toContainText('2 of 3');
  await page.keyboard.press('Tab');
  expect(await galleryDialog.evaluate(dialog => dialog.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: 'test-results/screenshot-gallery-modal-desktop.png' });
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await galleryDialog.evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/screenshot-gallery-modal-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(fullSize).toBeFocused();
  await fullSize.click();
  await expect(galleryDialog).toBeVisible();
  await page.mouse.click(1, 1);
  await expect(galleryDialog).toHaveCount(0);
  await expect(fullSize).toBeFocused();
  await expect(page.getByLabel('Rank: Boltor', { exact: true })).toHaveValue('12');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByLabel('Choose inventory screenshots').setInputFiles(Array.from({ length: 8 }, (_, index) => ({ ...later, name: `extra-${index}.png` })));
  await expect(page.getByRole('alert')).toContainText('Up to 10 screenshots per batch');
  await expect(add).toContainText('3/10 images');
  await expect(page.getByRole('button', { name: 'Import 3 items', exact: true })).toBeEnabled();
  expect(JSON.stringify(await account.inventory())).toBe(savedBefore);
  await page.getByRole('button', { name: 'Import 3 items', exact: true }).click();
  await expectImportFinished(page);
  const saved: Inventory = await account.inventory();
  expect(saved.items.find(item => item.name === 'Vasto')).toMatchObject({ rank: 0, mastered: true });
  expect(saved.items.find(item => item.name === 'Braton Vandal')).toMatchObject({ rank: 30, mastered: true });
  expect(saved.items.find(item => item.name === 'Boltor')).toEqual(JSON.parse(savedBefore!).items.find((item: { name: string }) => item.name === 'Boltor'));
  expect(saved.imports[0].files).toEqual(['first.png', 'paste.png', 'drop.png']);
  await page.getByRole('button', { name: 'Import screenshots', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review matches' })).toHaveCount(0);
  await expect(gallery).toHaveCount(0);
  await expect(page.getByLabel('Choose codex screenshots')).toBeEnabled();
});

test('canceling or failing an added screenshot keeps earlier matches and allows another upload', async ({ page }) => {
  await page.goto('/#import'); await waitForSave(page);
  const first = await equipmentScreenshot(page, 'first.png', ['BOLTOR [30]']);
  const next = await equipmentScreenshot(page, 'next.png', ['VASTO [0]']);
  await page.getByLabel('Choose codex screenshots').setInputFiles(first);
  await waitForScreenshotReview(page);
  await page.getByLabel('Rank: Boltor', { exact: true }).fill('12');
  await page.getByLabel('Choose codex screenshots').setInputFiles(inventoryScreenshots[0].file);
  await page.getByLabel('Choose codex screenshots').setInputFiles(inventoryScreenshots[1].file);
  await page.getByRole('button', { name: 'Cancel reading' }).click();
  await expect(page.getByText('Reading canceled.', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Add screenshots/ })).toContainText('1/10 images');
  const gallery = page.getByRole('list', { name: 'Screenshot previews' });
  await expect(gallery.getByRole('img')).toHaveCount(1);
  await expect(gallery.getByRole('img', { name: 'Import source: first.png', exact: true })).toBeVisible();
  await expect(page.getByLabel('Rank: Boltor', { exact: true })).toHaveValue('12');
  await expect(page.locator('.review-table tbody tr')).toHaveCount(1);
  await page.getByLabel('Choose codex screenshots').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Add screenshots/ })).toContainText('1/10 images');
  await expect(gallery.getByRole('img')).toHaveCount(1);
  await expect(page.getByLabel('Rank: Boltor', { exact: true })).toHaveValue('12');
  await page.getByLabel('Choose codex screenshots').setInputFiles(next);
  await waitForScreenshotReview(page);
  await expect(page.getByLabel('Rank: Vasto', { exact: true })).toHaveValue('0');
  await expect(page.getByLabel('Owned: Vasto', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Rank: Boltor', { exact: true })).toHaveValue('12');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(gallery.getByRole('img')).toHaveCount(2);
});

test('canceling OCR releases the importer and paste uses the focused source', async ({ page }) => {
  await page.goto('/#import'); await waitForSave(page);
  const dataUrl = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 1400; canvas.height = 700; const context = canvas.getContext('2d')!; context.fillStyle = '#ffffff'; context.fillRect(0, 0, 1400, 700); context.fillStyle = '#000000'; context.font = '42px Arial'; context.fillText('BRATON PRIME', 100, 150); return canvas.toDataURL('image/png'); });
  await page.getByLabel('Choose inventory screenshots').setInputFiles({ name: 'cancel-test.png', mimeType: 'image/png', buffer: Buffer.from(dataUrl.split(',')[1], 'base64') });
  await page.getByRole('button', { name: 'Cancel reading' }).click();
  await expect(page.getByText('Reading canceled.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Inventory', exact: true }).getByRole('button', { name: 'Drag and drop or Ctrl+V to paste. Or click to open file browser', exact: false })).toBeVisible();
  const pasteImage = () => page.evaluate(url => {
    const bytes = Uint8Array.from(atob(url.split(',')[1]), character => character.charCodeAt(0));
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([bytes], 'retry-test.png', { type: 'image/png' }));
    // Firefox strips files from constructed ClipboardEvents; attach the readable
    // clipboard payload a native paste would provide to the event handler.
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: clipboard });
    document.activeElement!.dispatchEvent(paste);
  }, dataUrl);
  await page.getByRole('button', { name: 'Codex instructions' }).click();
  await pasteImage();
  await expect(page.getByRole('list', { name: 'Screenshot previews' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  const codex = page.getByRole('region', { name: 'Codex', exact: true });
  await codex.getByRole('button', { name: 'Drag and drop or Ctrl+V to paste. Or click to open file browser', exact: false }).focus();
  await pasteImage();
  await expect(page.getByRole('heading', { name: 'Review matches' })).toBeVisible({ timeout: 60000 });
  await expect(codex.getByLabel('Owned: Braton Prime', { exact: true })).not.toBeChecked();
});

test('unreadable saved data is preserved and failed saves remain visible', async ({ page, account }) => {
  await account.signOut();
  await page.addInitScript(() => localStorage.setItem('warframe-toolkit.inventory.v1', 'broken original data'));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('could not be read');
  await page.getByRole('button', { name: 'Add weapon', exact: true }).click();
  await page.getByLabel('Weapon name', { exact: true }).fill('Custom item');
  await page.getByRole('button', { name: 'Add weapon', exact: true }).last().click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Couldn’t save');
  expect(await page.evaluate(() => localStorage.getItem('warframe-toolkit.inventory.v1'))).toBe('broken original data');
});

test('weapon catalog defaults to owned, combines filters, and adds an unowned weapon without saving the catalog', async ({ page, account }) => {
  const externalRequests: string[] = [];
  const errors: string[] = [];
  page.on('request', request => { if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5173')) externalRequests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await waitForSave(page);
  await expect(page.getByRole('heading', { name: 'Weapons', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Filter by slot', exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Incarnon filter', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Owned only', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('columnheader').first()).toContainText('Weapon');
  await expect(page.getByRole('button', { name: 'Add weapon', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(page.getByLabel('Owned only', { exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(30);
  const saved = JSON.stringify(await account.inventory());
  await page.getByLabel('Owned only', { exact: true }).uncheck();
  expect(await page.getByRole('button', { name: /^Edit / }).count()).toBeGreaterThan(650);
  await page.getByLabel('Search weapons').fill('bronco');
  await chooseOption(page, 'Variant filter', 'Prime');
  await chooseOption(page, 'Incarnon filter', 'Incarnon Genesis compatible');
  await chooseOption(page, 'Filter by slot', 'Secondary');
  await chooseOption(page, 'Used in crafting', 'Crafting ingredient');
  await chooseOption(page, 'Mastery', 'Not mastered');
  await page.getByLabel('Maximum required MR').fill('8');
  await expect(page.getByRole('button', { name: /^Edit / })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Edit Bronco Prime', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const activeFilters = page.getByRole('group', { name: 'Active weapon filters', exact: true });
  await expect(activeFilters.getByRole('combobox')).toHaveCount(5);
  await expect(page.getByRole('combobox', { name: 'Weapon type', exact: true })).toHaveCount(0);
  await expect(activeFilters.getByRole('combobox', { name: 'Filter by slot', exact: true })).toHaveText('Secondary');
  await expect(activeFilters.getByRole('combobox', { name: 'Incarnon filter', exact: true })).toHaveText('Incarnon Genesis compatible');
  await chooseOption(page, 'Filter by slot', 'All slots');
  await expect(page.getByRole('combobox', { name: 'Filter by slot', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeFocused();
  await chooseOption(page, 'Incarnon filter', 'Any Incarnon status');
  await expect(page.getByRole('combobox', { name: 'Incarnon filter', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit Bronco Prime', exact: true })).toBeVisible();
  expect(JSON.stringify(await account.inventory())).toBe(saved);
  await page.getByRole('button', { name: 'Edit Bronco Prime', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Bronco Prime', exact: true });
  await expect(dialog.getByRole('heading', { name: 'Crafting', exact: true })).toBeVisible();
  await expect(dialog.getByText('Bronco Prime Barrel', { exact: true })).toBeVisible();
  await expect(dialog.getByText('— consumes 2 × Bronco Prime', { exact: true })).toBeVisible();
  const image = dialog.getByRole('img', { name: 'Bronco Prime', exact: true });
  await expect(image).toBeVisible();
  expect(await image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
  await dialog.getByRole('tab', { name: 'My inventory' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Crafting target', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('checkbox', { name: 'Incarnon', exact: true })).toHaveCount(0);
  await dialog.getByLabel('Notes', { exact: true }).fill('Build an Incarnon loadout');
  await dialog.getByRole('checkbox', { name: 'Owned', exact: false }).check();
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  const data = await account.inventory();
  expect(data.items).toHaveLength(36);
  expect(data.items.find((item: { name: string }) => item.name === 'Bronco Prime')).toMatchObject({ owned: true, mastered: false, incarnon: true, craftingTarget: 'Akbronco Prime', notes: 'Build an Incarnon loadout' });
  expect(data.items.filter((item: { name: string }) => item.name !== 'Bronco Prime')).toEqual(JSON.parse(saved!).items);
  await waitForSave(page); await page.reload(); await waitForSave(page);
  await expect(page.getByRole('group', { name: 'Active weapon filters', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(page.getByLabel('Owned only', { exact: true })).toBeChecked();
  await page.getByLabel('Search weapons').fill('Bronco Prime');
  await expect(page.getByLabel('Owned: Bronco Prime', { exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Edit Bronco Prime', exact: true }).click();
  await page.getByRole('tab', { name: 'My inventory' }).click();
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue('Build an Incarnon loadout');
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('quest and crafting details stay local and filters fit mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await waitForSave(page);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByLabel('Owned only', { exact: true }).uncheck();
  await chooseOption(page, 'Quest reward', 'Weapon or blueprint reward');
  await chooseOption(page, 'Foundry recipe', 'No recorded recipe');
  await page.getByLabel('Search weapons').fill('Nataruk');
  await expect(page.getByRole('button', { name: 'Edit Nataruk', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/weapon-filters-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Edit Nataruk', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Nataruk', exact: true });
  await expect(dialog.getByText('No Foundry recipe recorded.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'The New War', exact: true })).toBeVisible();
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/weapon-details-mobile.png' });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Reset filters', exact: true }).first().click();
  await expect(page.getByLabel('Owned only', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Quest reward', { exact: true })).toHaveText('Any');
  await page.getByLabel('Search weapons').fill('Boltor');
  await page.getByRole('button', { name: 'Edit Boltor', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Boltor Incarnon Genesis', { exact: true }).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Weapon details' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'My inventory' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Notes', { exact: true })).toBeVisible();
});
