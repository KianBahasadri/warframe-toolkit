import { test, expect } from './accountFixture';
import type { Page } from '@playwright/test';
import { createEquipment } from '../../src/lib/model';
import type { Equipment } from '../../src/lib/model';
import { catalog } from '../../src/data/catalog';

function equipment(name: string, changes: Partial<Equipment> = {}) {
  return createEquipment(catalog.find(item => item.name === name)!, { mastered: true, ...changes });
}
async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('listbox', { name: label, exact: true }).getByRole('option', { name: option, exact: true }).click();
}
function row(page: Page, name: string) {
  return page.getByRole('row').filter({ has: page.getByRole('button', { name: `Edit ${name}`, exact: true }) });
}
async function edit(page: Page, name: string) {
  await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  await page.getByRole('tab', { name: 'My inventory', exact: true }).click();
}

test('recommendations react to mastery and saved adapters, and drive table filters and sorting', async ({ page, account }) => {
  await page.setViewportSize({ width: 1800, height: 1000 });
  await page.goto('/');
  const inventory = await account.inventory();
  inventory.items = [
    equipment('Anku', { mastered: false, rank: 30 }),
    equipment('Boltor'), equipment('Braton', { override: 'Keep', powerful: true }), equipment('Phenmor'),
  ];
  await account.setInventory(inventory);
  await page.reload();
  const before = await account.inventory();
  await expect(row(page, 'Anku').locator('.recommended-action')).toHaveText('Master');
  await expect(row(page, 'Boltor').locator('.recommended-action')).toHaveText('Use for crafting');
  await expect(row(page, 'Braton').locator('.recommended-action')).toHaveText('Sell');
  await expect(row(page, 'Phenmor').locator('.recommended-action')).toHaveText('Keep');
  const action = row(page, 'Boltor').locator('.recommended-action');
  await action.hover();
  await expect(page.getByRole('tooltip')).toContainText('Boltace (1× Boltor)');
  await expect(action).toHaveAccessibleDescription(/Boltace/);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.mouse.move(0, 0);
  await action.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await action.press('Tab');
  await expect(page.getByRole('tooltip')).toHaveCount(0);

  const header = page.getByRole('button', { name: 'Recommended action column options', exact: true });
  await header.click();
  await page.getByRole('menuitemradio', { name: 'Sort ascending', exact: true }).click();
  await expect(page.locator('.inventory-table .equipment-label')).toHaveText(['Phenmor', 'Anku', 'Braton', 'Boltor']);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await choose(page, 'Recommended action filter', 'Master');
  await expect(page.locator('.inventory-table .equipment-label')).toHaveText(['Anku']);
  expect(await account.inventory()).toEqual(before);
  // The row leaves this filter immediately, so assert the result after clicking.
  await page.getByRole('checkbox', { name: 'Mastered: Anku', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit Anku', exact: true })).toHaveCount(0);
  await choose(page, 'Recommended action filter', 'Add Incarnon');
  await expect(row(page, 'Anku').locator('.recommended-action')).toHaveText('Add Incarnon');
  await edit(page, 'Anku');
  await expect(page.getByRole('combobox', { name: 'Incarnon adapter installed', exact: true })).toContainText('Unknown');
  await choose(page, 'Incarnon adapter installed', 'Yes');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await choose(page, 'Recommended action filter', 'Keep');
  await expect(page.locator('.inventory-table .equipment-label')).toHaveText(['Anku', 'Phenmor']);
  const saved = await account.inventory();
  expect(saved.items.find(item => item.name === 'Anku')).toMatchObject({ mastered: true, rank: 30, incarnonInstalled: 'Yes' });
  expect(saved.items.some(item => 'recommendation' in item)).toBe(false);
  await page.reload();
  await expect(row(page, 'Anku').locator('.recommended-action')).toHaveText('Keep');
  await edit(page, 'Braton');
  await expect(page.getByRole('dialog').getByText('A Prime counterpart exists, so the recommendation cannot be Keep. Your saved override is preserved.')).toBeVisible();
  await choose(page, 'Incarnon adapter installed', 'Yes');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(row(page, 'Braton').locator('.recommended-action')).toHaveText('Remove Incarnon');
  await account.inventory();
  await page.screenshot({ path: 'test-results/recommendations-weapons.png', fullPage: true });
});

test('crafting progress recalculates across the inventory and Warframe Helminth settings persist', async ({ page, account }) => {
  await page.goto('/');
  const inventory = await account.inventory();
  inventory.items = [
    equipment('Boltor'), equipment('Boltace', { owned: false, mastered: false }),
    equipment('Wisp', { override: 'Keep' }), equipment('Wisp Prime'), equipment('Voidrig'),
  ];
  await account.setInventory(inventory);
  await page.reload();
  await expect(row(page, 'Boltor').locator('.recommended-action')).toHaveText('Use for crafting');
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Owned only', exact: true }).uncheck();
  await page.getByRole('textbox', { name: 'Search weapons', exact: true }).fill('Boltace');
  await page.getByRole('checkbox', { name: 'Mastered: Boltace', exact: true }).check();
  await page.getByRole('textbox', { name: 'Search weapons', exact: true }).fill('Boltor');
  await expect(row(page, 'Boltor').locator('.recommended-action')).toHaveText('Sell');
  await account.inventory();
  await page.getByRole('link', { name: 'Warframes', exact: true }).click();
  await expect(row(page, 'Wisp').locator('.recommended-action')).toHaveText('Check Helminth');
  await expect(row(page, 'Wisp Prime').locator('.recommended-action')).toHaveText('Keep');
  await edit(page, 'Wisp');
  await choose(page, 'Helminth ability unlocked', 'No');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(row(page, 'Wisp').locator('.recommended-action')).toHaveText('Subsume');
  await edit(page, 'Wisp');
  await choose(page, 'Helminth ability unlocked', 'Yes');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(row(page, 'Wisp').locator('.recommended-action')).toHaveText('Sell');
  expect((await account.inventory()).items.find(item => item.name === 'Wisp')).toMatchObject({ helminth: 'Yes', override: 'Keep' });
  await page.reload();
  await expect(row(page, 'Wisp').locator('.recommended-action')).toHaveText('Sell');
  for (const name of ['Wisp Prime', 'Voidrig']) {
    await edit(page, name);
    await expect(page.getByRole('combobox', { name: 'Helminth ability unlocked', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
  }
});
