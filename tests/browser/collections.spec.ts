import { test, expect } from './accountFixture';
import { createEquipment } from '../../src/lib/model';
import { createRelic } from '../../src/lib/relics';

test('all collections share the toolbar, column menus, responsive layout, and add shortcut', async ({ page, account }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const inventory = await account.inventory();
  inventory.items.push(createEquipment({ name: 'Wisp Prime', slot: 'Warframe', variant: 'Prime' }));
  inventory.relics = [{ ...createRelic(), name: 'Lith A1', quantity: 2 }];
  await account.setInventory(inventory);
  await page.reload();
  const saved = JSON.stringify(await account.inventory());
  const checkColumnLabels = async () => {
    const columns = page.getByRole('group', { name: 'Table columns', exact: true });
    const notes = columns.getByRole('checkbox', { name: 'Notes', exact: true });
    const initiallyVisible = await notes.isChecked();
    const notesLabel = columns.getByText('Notes', { exact: true });
    await notesLabel.click();
    await expect(columns).toBeVisible();
    await expect(notes).toBeFocused();
    await expect(page.getByRole('button', { name: 'Notes column options', exact: true })).toHaveCount(initiallyVisible ? 0 : 1);
    await notesLabel.click();
    await expect(columns).toBeVisible();
    await expect(page.getByRole('button', { name: 'Notes column options', exact: true })).toHaveCount(initiallyVisible ? 1 : 0);
    // The required name column cannot toggle, and clicking its label stays inside.
    await columns.locator('label:has(input:disabled) span').click({ force: true });
    await expect(columns).toBeVisible();
    await expect(columns.locator('input:disabled')).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(columns).toHaveCount(0);
  };
  let toolbarTop: number | undefined;
  for (const [name, filterName, addName] of [['Weapons', 'Weapon filters', 'Add weapon'], ['Warframes', 'Warframe filters', 'Add Warframe'], ['Relics', 'Relic filters', 'Add relic']]) {
    await page.getByRole('link', { name, exact: true }).click();
    const section = page.getByRole('region', { name, exact: true });
    await expect(section).toBeVisible();
    await expect(section.getByRole('heading', { name, exact: true })).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'Columns', exact: true })).toBeVisible();
    await expect(section.getByRole('button', { name: addName, exact: true })).toBeVisible();
    await expect(section.getByRole('button', { name: 'Export CSV', exact: true })).toBeVisible();
    await section.getByRole('button', { name: 'Columns', exact: true }).click();
    await checkColumnLabels();
    await expect(section.getByRole('button', { name: 'Columns', exact: true })).toBeFocused();
    const bounds = (await section.locator('.inventory-toolbar').boundingBox())!;
    toolbarTop ??= bounds.y;
    expect(bounds.y).toBe(toolbarTop);
    await section.getByRole('button', { name: 'Filters', exact: true }).click();
    await expect(section.getByRole('group', { name: filterName, exact: true }).getByRole('checkbox', { name: 'Owned only' })).toBeVisible();
    await section.getByRole('button', { name: 'Filters', exact: true }).click();
    await expect(section.getByRole('group', { name: filterName, exact: true })).toHaveCount(0);
    await section.getByRole('columnheader').first().click({ button: 'right' });
    const menu = page.getByRole('group', { name: /Column actions for/ });
    await expect(menu.getByRole('menuitemradio', { name: 'Sort ascending' })).toBeVisible();
    await expect(menu.getByRole('textbox', { name: /contains$/ })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Add or remove columns' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Hide column' })).toBeDisabled();
    await menu.getByRole('menuitem', { name: 'Add or remove columns' }).click();
    await checkColumnLabels();
    await page.keyboard.press('Alt+n');
    await expect(page.getByRole('dialog', { name: addName, exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.screenshot({ path: `test-results/collection-${name.toLowerCase()}-desktop.png` });
    await page.setViewportSize({ width: 320, height: 720 });
    await expect(section.getByRole('button', { name: 'Columns', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await section.getByRole('button', { name: 'Filters', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/collection-${name.toLowerCase()}-mobile.png` });
    await section.getByRole('button', { name: 'Filters', exact: true }).click();
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  expect(JSON.stringify(await account.inventory())).toBe(saved);
});

test('relics share numeric filters, sort priorities, hidden-column filters, and isolated column preferences', async ({ page, account }) => {
  await page.goto('/#relics');
  const inventory = await account.inventory();
  inventory.relics = [
    { ...createRelic(), name: 'Lith A1', quantity: 0 },
    { ...createRelic(), name: 'Lith A1', refinement: 'Radiant', quantity: 2 },
    { ...createRelic(), name: 'Neo N1', refinement: 'Flawless', quantity: 100 },
  ];
  await account.setInventory(inventory);
  await page.reload();
  const saved = JSON.stringify(await account.inventory());
  const names = page.locator('.inventory-table .equipment-label');
  const quantity = page.getByRole('button', { name: 'Quantity column options' });
  const menu = page.getByRole('group', { name: /Column actions for/ });
  await quantity.click();
  await menu.getByRole('menuitemradio', { name: 'Sort descending' }).click();
  await quantity.press('Shift+F10');
  await menu.getByRole('menuitem', { name: /^Sort priority/ }).click();
  await menu.getByRole('menuitemradio').first().click();
  await expect(names).toHaveText(['Neo N1', 'Lith A1', 'Lith A1']);
  await expect(quantity).toHaveAccessibleDescription('Sort priority 1 of 2, descending');
  await quantity.click({ button: 'right' });
  await page.getByRole('combobox', { name: 'Quantity condition' }).click();
  await page.getByRole('option', { name: 'At least', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Filter quantity' }).fill('50');
  await expect(names).toHaveText(['Neo N1']);
  await page.keyboard.press('Escape');
  await quantity.click();
  await menu.getByRole('menuitem', { name: 'Hide column' }).click();
  await expect(quantity).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Column filters', exact: true })).toContainText('Quantity: At least 50');
  await expect(names).toHaveText(['Neo N1']);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Owned only', exact: true }).check();
  await expect(page.getByRole('button', { name: 'Remove Quantity filter' })).toHaveCount(0);
  await expect(names).toHaveText(['Lith A1', 'Neo N1']);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Owned only', exact: true })).toBeVisible();
  // Resetting an active filter removes its control, so verify that result after a click.
  await page.getByRole('checkbox', { name: 'Owned only', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Owned only', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeFocused();
  await expect(names).toHaveCount(3);
  await page.getByRole('button', { name: 'Edit Lith A1 Intact' }).focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('button', { name: 'Edit Neo N1 Flawless' })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(page.getByRole('button', { name: 'Edit Lith A1 Intact' })).toBeFocused();
  await page.reload();
  await expect(quantity).toHaveCount(0);
  await page.getByRole('link', { name: 'Weapons', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Rank column options' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Owned column options' })).toBeVisible();
  await page.getByRole('link', { name: 'Relics', exact: true }).click();
  await expect(quantity).toHaveCount(0);
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  await page.getByRole('button', { name: 'Reset to default' }).click();
  await page.keyboard.press('Escape');
  await expect(quantity).toBeVisible();
  expect(JSON.stringify(await account.inventory())).toBe(saved);
});

test('Warframes browse the full catalog and use shared filters without saving catalog entries', async ({ page, account }) => {
  await page.goto('/#warframes');
  const saved = JSON.stringify(await account.inventory());
  await page.getByRole('button', { name: 'Browse all Warframes', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search Warframes' }).fill('Wisp');
  await expect(page.locator('.inventory-table .equipment-label')).toHaveText(['Wisp', 'Wisp Prime']);
  await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Weapon type', exact: true })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Variant filter', exact: true }).click();
  await page.getByRole('option', { name: 'Prime', exact: true }).click();
  await expect(page.locator('.inventory-table .equipment-label')).toHaveText(['Wisp Prime']);
  expect(JSON.stringify(await account.inventory())).toBe(saved);
  await page.getByRole('checkbox', { name: 'Owned: Wisp Prime', exact: true }).check();
  const after = await account.inventory();
  expect(after.items.filter(item => item.slot === 'Warframe')).toHaveLength(1);
  expect(after.items.find(item => item.name === 'Wisp Prime')?.owned).toBe(true);
});
