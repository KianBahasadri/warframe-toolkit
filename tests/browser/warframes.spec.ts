import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from './accountFixture';
import { catalog } from '../../src/data/catalog';
import { createEquipment } from '../../src/lib/model';
import type { Equipment } from '../../src/lib/model';

const frame = (name: string, changes: Partial<Equipment> = {}) => createEquipment(catalog.find(item => item.name === name)!, changes);
const row = (page: Page, name: string) => page.getByRole('row').filter({ has: page.getByRole('button', { name: `Edit ${name}`, exact: true }) });
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('listbox', { name: label, exact: true }).getByRole('option', { name: option, exact: true }).click();
}

test('Warframes exposes relevant columns, filters and Necramech types without changing inventory', async ({ page, account }) => {
  await page.goto('/warframes');
  const before = await account.inventory();
  await expect(page.getByRole('heading', { name: 'No owned Warframes yet' })).toBeVisible();
  await expect(page.getByRole('columnheader')).toHaveText(['Warframe', 'WFM', 'Owned', 'Rank', 'Mastered', 'Upgraded', 'Recommended action', 'Has Prime variant', 'Helminth unlocked']);
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  const columns = page.getByRole('group', { name: 'Table columns', exact: true });
  for (const name of ['Equipment', 'Incarnon', 'Crafting target', 'Crafting ingredient', 'Slot', 'Quest weapon', 'Meta / powerful']) {
    await expect(columns.getByRole('checkbox', { name, exact: true })).toHaveCount(0);
  }
  for (const name of ['Quest reward', 'Favorite', 'Notes', 'Helminth unlocked']) {
    await expect(columns.getByRole('checkbox', { name, exact: true })).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Browse all Warframes', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search Warframes', exact: true }).fill('Wisp');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  const filters = page.getByRole('group', { name: 'Warframe filters', exact: true });
  await expect(filters.getByRole('combobox', { name: /Incarnon|Weapon type|Used in crafting|Filter by slot/ })).toHaveCount(0);
  await expect(filters.getByRole('spinbutton', { name: 'Maximum required MR' })).toHaveCount(0);
  await filters.getByRole('combobox', { name: 'Recommended action filter', exact: true }).click();
  await expect(page.getByRole('option', { name: /Incarnon|crafting|spare/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await choose(page, 'Helminth ability unlocked', 'Unknown');
  await expect(page.locator('.inventory-table .equipment-label')).toHaveText(['Wisp']);
  await choose(page, 'Helminth ability unlocked', 'Not applicable');
  await expect(page.locator('.inventory-table .equipment-label')).toHaveText(['Wisp Prime']);
  await choose(page, 'Helminth ability unlocked', 'Any');
  await page.getByRole('textbox', { name: 'Search Warframes', exact: true }).fill('');
  await choose(page, 'Type', 'Necramech');
  await expect(page.locator('.inventory-table .equipment-label')).toHaveText(['Bonewidow', 'Voidrig']);
  await expect(row(page, 'Voidrig').locator('.equipment-meta')).toHaveText('Necramech');
  await expect(row(page, 'Voidrig').locator('[data-column-key="helminth"]')).toHaveText('Not applicable');
  expect(await account.inventory()).toEqual(before);
});

test('Warframe details and editing honor Helminth eligibility, rank limits and legacy planning data', async ({ page, account }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/warframes');
  const inventory = await account.inventory();
  const wisp = frame('Wisp', { mastered: true, rank: 30, helminth: 'No', craftingIngredient: true, craftingTarget: 'Legacy target', incarnon: true, incarnonInstalled: 'Yes', source: 'Weapon catalog' });
  inventory.items = [wisp, frame('Wisp Prime'), frame('Excalibur Umbra'), frame('Voidrig')];
  await account.setInventory(inventory);
  await page.reload();
  await expect(row(page, 'Wisp').locator('.recommended-action')).toHaveText('Subsume');
  await page.getByRole('button', { name: 'Edit Wisp', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('tab', { name: 'Warframe details', exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Warframe wiki ↗', exact: true })).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Crafting', exact: true })).toBeVisible();
  await expect(dialog.getByRole('region', { name: /Incarnon|Weapon stats/ })).toHaveCount(0);
  await expect(dialog.getByText('Stats unavailable in this source.', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/warframe-details-desktop.png' });
  await dialog.getByRole('tab', { name: 'My inventory', exact: true }).click();
  await expect(dialog.getByText('Warframe catalog', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Incarnon adapter installed', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('textbox', { name: 'Crafting target', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('checkbox', { name: /^Favorite/ })).toBeVisible();
  const rank = dialog.getByRole('spinbutton', { name: 'Current rank', exact: true });
  await expect(rank).toHaveAttribute('max', '30');
  await rank.fill('31');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(await rank.evaluate((input: HTMLInputElement) => input.validity.rangeOverflow)).toBe(true);
  await rank.fill('30');
  await choose(page, 'Helminth ability unlocked', 'Yes');
  await dialog.getByRole('textbox', { name: 'Notes', exact: true }).fill('Ability unlocked');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(row(page, 'Wisp').locator('.recommended-action')).toHaveText('Sell');
  const saved = (await account.inventory()).items.find(item => item.name === 'Wisp')!;
  expect({ ...saved, updatedAt: wisp.updatedAt }).toEqual({ ...wisp, helminth: 'Yes', notes: 'Ability unlocked' });
  for (const [name, kind, maxRank] of [['Wisp Prime', 'Warframe', '30'], ['Excalibur Umbra', 'Warframe', '30'], ['Voidrig', 'Necramech', '40']]) {
    await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
    await expect(dialog.getByRole('tab', { name: `${kind} details`, exact: true })).toBeVisible();
    await expect(dialog.getByText('Maximum rank', { exact: true }).locator('..')).toContainText(maxRank);
    await expect(dialog.getByText('Weapon reward', { exact: true })).toHaveCount(0);
    await dialog.getByRole('tab', { name: 'My inventory', exact: true }).click();
    await expect(rank).toHaveAttribute('max', maxRank);
    await expect(dialog.getByRole('combobox', { name: 'Helminth ability unlocked', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
  }
  await page.reload();
  await expect(row(page, 'Wisp').locator('[data-column-key="helminth"]')).toHaveText('Yes');
  await page.keyboard.press('Alt+Shift+t');
  await page.screenshot({ path: 'test-results/warframes-light.png' });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.getByRole('button', { name: 'Edit Wisp', exact: true }).click();
  await dialog.getByRole('tab', { name: 'My inventory', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/warframe-editor-mobile.png' });
});

test('adding Warframes uses the correct catalog, custom fields and collection', async ({ page, account }) => {
  await page.goto('/warframes');
  await account.inventory();
  await page.getByRole('button', { name: 'Add Warframe', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Warframe', exact: true });
  await dialog.getByRole('combobox', { name: 'Variant', exact: true }).click();
  await expect(page.getByRole('listbox', { name: 'Variant', exact: true }).getByRole('option')).toHaveText(['Base', 'Prime', 'Umbra']);
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('combobox', { name: 'Slot', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('checkbox', { name: /Incarnon|Crafting ingredient|Quest weapon/ })).toHaveCount(0);
  await expect(dialog.getByRole('checkbox', { name: /^Quest reward/ })).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Find in the Warframe catalog', exact: true }).fill('Wisp');
  await expect(dialog.locator('.catalog-results button')).toHaveText(['WispWarframe', 'Wisp PrimeWarframe']);
  await dialog.getByRole('textbox', { name: 'Find in the Warframe catalog', exact: true }).fill('Boltor');
  await expect(dialog.locator('.catalog-results button')).toHaveCount(0);
  await dialog.getByRole('textbox', { name: 'Warframe name', exact: true }).fill('Boltor');
  await dialog.getByRole('button', { name: 'Add Warframe', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Add Boltor from the Weapons page.');
  await dialog.getByRole('textbox', { name: 'Warframe name', exact: true }).fill('Custom Warframe');
  await dialog.getByRole('spinbutton', { name: 'Current rank', exact: true }).fill('29');
  await dialog.getByRole('button', { name: 'Add Warframe', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Custom Warframe', exact: true })).toBeVisible();
  expect((await account.inventory()).items.find(item => item.name === 'Custom Warframe')).toMatchObject({ slot: 'Warframe', variant: 'Base', rank: 29, mastered: false });
  await page.reload();
  await expect(row(page, 'Custom Warframe').locator('.recommended-action')).toHaveText('Master');
  await page.getByRole('link', { name: 'Weapons', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Custom Warframe', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add weapon', exact: true }).click();
  await page.getByRole('textbox', { name: 'Find in the weapon catalog', exact: true }).fill('Wisp');
  await expect(page.locator('.catalog-results button')).toHaveCount(0);
});

test('Warframes export includes only tracked Warframes and uses relevant CSV headings', async ({ page, account }) => {
  await page.goto('/warframes');
  const inventory = await account.inventory();
  inventory.items.push(frame('Wisp', { mastered: true, helminth: 'No', notes: 'For Helminth' }), frame('Wisp Prime', { owned: false }), frame('Voidrig'));
  await account.setInventory(inventory);
  await page.reload();
  const before = await account.inventory();
  await page.getByRole('button', { name: 'Open search and commands' }).click();
  await page.getByRole('combobox', { name: 'Search commands' }).fill('Export Warframes CSV');
  const download = page.waitForEvent('download');
  await page.keyboard.press('Enter');
  const csv = await download;
  expect(csv.suggestedFilename()).toMatch(/^grakata-warframes-.*\.csv$/);
  const contents = await readFile((await csv.path())!, 'utf8');
  expect(contents).toContain('"Helminth Ability Unlocked","Recommended Action","Favorite","Quest Reward"');
  expect(contents).toContain('"Wisp","Warframe","TRUE"');
  expect(contents).toContain('"Wisp Prime","Warframe","FALSE"');
  expect(contents).toContain('"Voidrig","Necramech"');
  expect(contents).toContain('"Subsume"');
  expect(contents).not.toMatch(/Boltor|Bonewidow|Weapon Name|Incarnon|Crafting Target/);
  await expect(page.getByRole('region', { name: 'Notifications', exact: true }).getByText('Warframes CSV downloaded.', { exact: true })).toBeVisible();
  expect(await account.inventory()).toEqual(before);
});
