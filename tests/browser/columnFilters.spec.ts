import { test, expect } from './accountFixture';
import { createEquipment } from '../../src/lib/model';
import { createRelic } from '../../src/lib/relics';

test.beforeEach(async ({ page, account }) => {
  await page.addInitScript(() => {
    localStorage.setItem('arsenal.inventory-columns', JSON.stringify(['name', 'variant']));
    localStorage.setItem('grakata.warframe-columns', JSON.stringify(['name', 'variant']));
  });
  await page.goto('/');
  const inventory = await account.inventory();
  inventory.items = [
    createEquipment({ name: 'Braton', slot: 'Primary', variant: 'Base' }),
    createEquipment({ name: 'Braton Prime', slot: 'Primary', variant: 'Prime' }),
    createEquipment({ name: 'Braton Vandal', slot: 'Primary', variant: 'Vandal' }),
    createEquipment({ name: 'Wisp', slot: 'Warframe', variant: 'Base' }),
    createEquipment({ name: 'Wisp Prime', slot: 'Warframe', variant: 'Prime' }),
    createEquipment({ name: 'Excalibur Umbra', slot: 'Warframe', variant: 'Umbra' }),
  ];
  inventory.relics = [
    { ...createRelic(), name: 'Lith A1', refinement: 'Intact', quantity: 1 },
    { ...createRelic(), name: 'Meso B1', refinement: 'Radiant', quantity: 1 },
    { ...createRelic(), name: 'Neo N1', refinement: 'Flawless', quantity: 1 },
  ];
  await account.setInventory(inventory);
  await page.reload();
});

for (const { tab, column, first, second, matches, remaining } of [
  { tab: 'Weapons', column: 'Variant', first: 'Prime', second: 'Vandal', matches: ['Braton Prime', 'Braton Vandal'], remaining: 'Braton Vandal' },
  { tab: 'Warframes', column: 'Variant', first: 'Prime', second: 'Umbra', matches: ['Excalibur Umbra', 'Wisp Prime'], remaining: 'Excalibur Umbra' },
  { tab: 'Relics', column: 'Refinement', first: 'Radiant', second: 'Flawless', matches: ['Meso B1', 'Neo N1'], remaining: 'Neo N1' },
]) test(`${tab} allow multiple column choices, cancel drafts, and clear selections without changing inventory`, async ({ page, account }) => {
  if (tab === 'Relics') await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole('link', { name: tab, exact: true }).click();
  const saved = JSON.stringify(await account.inventory());
  const names = page.locator('.inventory-table .equipment-label');
  const header = page.getByRole('button', { name: `${column} column options`, exact: true });
  const menu = page.getByRole('group', { name: `Column actions for ${column}`, exact: true });
  const choices = page.getByRole('group', { name: `${column} filter values`, exact: true });
  const firstChoice = choices.getByRole('checkbox', { name: first, exact: true });
  const secondChoice = choices.getByRole('checkbox', { name: second, exact: true });
  const apply = page.getByRole('button', { name: 'Apply filter', exact: true });
  const chip = page.getByRole('button', { name: `${column}: ${first} or ${second}`, exact: true });

  await header.click();
  await choices.getByText(first, { exact: true }).click();
  await secondChoice.focus();
  await secondChoice.press('Space');
  await expect(menu).toBeVisible();
  await expect(firstChoice).toBeChecked();
  await expect(secondChoice).toBeChecked();
  await expect(names).toHaveCount(3);
  await apply.click();
  await expect(names).toHaveText(matches);
  await expect(header).toBeFocused();

  await chip.click();
  await expect(firstChoice).toBeChecked();
  await expect(secondChoice).toBeChecked();
  await firstChoice.uncheck();
  await firstChoice.press('Escape');
  await expect(chip).toBeFocused();
  await expect(names).toHaveText(matches);
  await chip.click();
  await expect(firstChoice).toBeChecked();
  await expect(secondChoice).toBeChecked();
  await page.keyboard.press('Escape');

  await header.click();
  await menu.getByRole('menuitem', { name: 'Hide column', exact: true }).click();
  await expect(header).toHaveCount(0);
  await expect(names).toHaveText(matches);
  await chip.click();
  await firstChoice.uncheck();
  await apply.click();
  await expect(names).toHaveText([remaining]);
  await page.getByRole('button', { name: `${column}: ${second}`, exact: true }).click();
  await secondChoice.uncheck();
  await apply.click();
  await expect(page.getByRole('group', { name: 'Column filters', exact: true })).toHaveCount(0);
  await expect(names).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(JSON.stringify(await account.inventory())).toBe(saved);
});
