import { test, expect } from './accountFixture';
import type { Page } from '@playwright/test';
import { DROP_TABLES_URL } from '../../src/lib/dropTables';
import type { DropDataset, DropRow } from '../../src/lib/dropTables';

const row = (reward: string, source: string, chance: number | null): DropRow => ({ id: `${reward}-${source}`, reward, source, chance, tableChance: 33.33, sourceChance: null, section: 'Enemy Blueprint Drops', category: 'Enemy', location: 'Venus', mission: '', rotation: '', stage: '', era: '', refinement: '', rarity: 'Uncommon', anchor: '' });
const drops: DropDataset = { rows: [row('Rhino Neuroptics Blueprint', 'Jackal', 33.33), row('Rhino Prime Neuroptics Blueprint', 'Unrelated Prime source', 10), row('500X Ferrite', 'Resource cache', null), row('Ferrite Dust', 'Unrelated resource', 90)], fetchedAt: '2026-10-13T12:00:00.000Z', updated: 'October 13, 2026', sourceUrl: DROP_TABLES_URL, skippedRows: 0, reverseIndexRows: 0 };
const region = (page: Page) => page.getByRole('region', { name: 'Crafting', exact: true });
async function open(page: Page) {
  await page.route('**/api/droptables', route => route.fulfill({ json: drops }));
  await page.goto('/#crafting');
  await expect(page.getByRole('button', { name: 'Craft Rhino', exact: true })).toBeEnabled();
}
async function select(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('listbox', { name: label, exact: true }).getByRole('option', { name: option, exact: true }).click();
}
async function add(page: Page, name: string) {
  await page.getByRole('link', { name: 'Crafting', exact: true }).click();
  await expect(page.getByRole('tabpanel')).toHaveCount(0);
  await page.getByRole('searchbox', { name: 'Search craftable items' }).fill(name);
  await page.getByRole('button', { name: `Craft ${name}`, exact: true }).click();
  await expect(region(page).getByRole('heading', { name, exact: true })).toBeVisible();
}

async function finishIngredients(page: Page) {
  const checkbox = page.locator('.craft-branches > .craft-branch > .craft-node input[type="checkbox"]').first();
  while (await checkbox.count()) { const name = (await checkbox.getAttribute('aria-label'))!; await page.getByRole('checkbox', { name, exact: true }).check(); }
}
async function closeSelected(page: Page) {
  await page.locator('.craft-plan-tab').filter({ has: page.getByRole('tab', { selected: true }) }).getByRole('button', { name: /^Close / }).click();
}

test('Oxylus blueprint search exposes exact ingredients, nested batches, and saved progress', async ({ page, account }) => {
  await open(page);
  const before = (await account.profile()).inventory;
  await select(page, 'Crafting category', 'Companions');
  await page.getByRole('searchbox', { name: 'Search craftable items' }).fill('Oxylus blueprint');
  await page.getByRole('button', { name: 'Craft Oxylus', exact: true }).click();
  await expect(page.locator('.craft-root')).toContainText('Companions');
  await expect(page.locator('.craft-root .craft-cost')).toContainText('15,000');
  for (const [name, count] of [['Goblite Tears', '15'], ['Axidrol Alloy', '45'], ['Scrap', '40'], ['Longwinder Lathe Coagulant', '10']]) {
    await expect(page.locator(`.craft-branches > .craft-branch[data-item="${name}"] > .craft-node .craft-quantity`)).toHaveText(`× ${count}`);
  }
  await expect(page.locator('.craft-branch[data-item="Goblite Tears"] > .craft-node .craft-cost')).toContainText('2 builds');
  await expect(page.locator('.craft-branch[data-item="Axidrol Alloy"] > .craft-node .craft-cost')).toContainText('3 builds');
  await expect(page.locator('.craft-progress')).toContainText('23,000');
  await page.getByRole('button', { name: 'Add 20 completed Axidrol Alloy', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Completed quantity for Axidrol Alloy', exact: true })).toHaveValue('20');
  expect(Object.values((await account.profile()).craftingPlans[0].progress!)).toEqual([20]);
  await page.reload();
  await page.getByRole('tab', { name: 'Oxylus', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Completed quantity for Axidrol Alloy', exact: true })).toHaveValue('20');
  expect((await account.profile()).inventory).toEqual(before);
});

test('standalone categories are searchable and batch recipes retain their exact output', async ({ page }) => {
  await open(page);
  for (const [category, name] of [['Vehicles', 'Itzal'], ['Vehicles', 'Mantis'], ['Companions', 'Taxon'], ['Cosmetics', 'Ash Locust Helmet'], ['Materials', 'Anspatha Brace'], ['Gear', 'Orokin Catalyst']]) {
    await select(page, 'Crafting category', category);
    await page.getByRole('searchbox', { name: 'Search craftable items' }).fill(name);
    await expect(page.getByRole('button', { name: `Craft ${name}`, exact: true })).toBeVisible();
  }
  await page.getByRole('searchbox', { name: 'Search craftable items' }).fill('Cipher blueprint');
  await page.getByRole('button', { name: 'Craft Cipher', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Craft quantity', exact: true }).fill('11');
  await page.getByRole('combobox', { name: 'Recipe', exact: true }).click();
  await page.getByRole('listbox', { name: 'Recipe', exact: true }).getByRole('option', { name: /10 \/ build · 9,000 credits/ }).click();
  await expect(page.locator('.craft-root .craft-cost')).toContainText('2 builds');
  await expect(page.locator('.craft-root .craft-cost')).toContainText('10 / build');
  await expect(page.locator('.craft-branch[data-item="Ferrite"] .craft-quantity')).toHaveText('× 7,200');
  await expect(page.locator('.craft-progress')).toContainText('18,000');
});

test('quantity scales every material immediately and inactive plans close independently', async ({ page, account }) => {
  await open(page); await page.getByRole('button', { name: 'Craft Rhino', exact: true }).click();
  const before = await account.profile();
  const materials = page.getByRole('complementary', { name: 'Remaining materials', exact: true });
  const original = await materials.getByRole('button').evaluateAll(buttons => buttons.map(button => ({ label: button.getAttribute('aria-label')!, quantity: Number(button.querySelector('strong')!.textContent!.replaceAll(',', '')) })));
  await page.getByRole('spinbutton', { name: 'Craft quantity', exact: true }).fill('2');
  for (const material of original) await expect(materials.getByRole('button', { name: material.label, exact: true }).locator('strong')).toHaveText((material.quantity * 2).toLocaleString());
  await expect(page.locator('.craft-branch[data-item="Rhino Neuroptics"] > .craft-node .craft-quantity')).toHaveText('× 2');
  await expect(page.locator('.craft-progress')).toContainText('140,000');
  await expect(page.getByRole('checkbox', { name: 'Completed: Rhino', exact: true })).toHaveCount(0);
  await add(page, 'Forma');
  await page.getByRole('button', { name: 'Close Rhino × 2 plan', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Forma', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect((await account.profile()).inventory).toEqual(before.inventory);
});

test('legacy completed root progress can be reopened without the removed checkbox', async ({ page, account }) => {
  const profile = (await account.session()).profile;
  await account.setProfile({ ...profile, craftingPlans: [{ id: 'legacy-complete', itemId: '/Lotus/Powersuits/Rhino/Rhino', quantity: 1, choices: {}, completed: ['root'] }] });
  await page.goto('/#crafting'); await page.getByRole('tab', { name: 'Rhino', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Completed quantity for Rhino', exact: true });
  await expect(slider).toHaveValue('1'); await slider.focus(); await slider.press('Home');
  await expect(page.locator('.craft-branch[data-item="Rhino Neuroptics"]')).toBeVisible();
  await expect(slider).toBeFocused();
  expect((await account.profile()).craftingPlans[0].completed).toEqual([]);
});

test('ingredient completion is independent by branch, saves across navigation and reload, and preserves inventory', async ({ page, account }) => {
  await open(page);
  const before = await account.profile();
  await page.getByRole('button', { name: 'Craft Rhino', exact: true }).click();
  const neuroptics = page.locator('.craft-branch[data-item="Rhino Neuroptics"]');
  const systems = page.locator('.craft-branch[data-item="Rhino Systems"]');
  const polymer = neuroptics.getByRole('checkbox', { name: 'Completed: Polymer Bundle', exact: true });
  const component = page.getByRole('checkbox', { name: 'Completed: Rhino Neuroptics', exact: true });
  await polymer.click();
  await expect(systems.getByRole('checkbox', { name: 'Completed: Polymer Bundle', exact: true })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Sources for remaining Polymer Bundle', exact: true })).toContainText('100');
  await component.click();
  await expect(polymer).not.toBeVisible();
  await expect(page.getByRole('list', { name: 'Completed ingredients for Rhino', exact: true }).getByRole('checkbox')).toBeFocused();
  await expect(page.locator('.craft-progress')).toContainText('55,000');
  const saved = await account.profile();
  expect(saved.craftingPlans[0].completed).toHaveLength(2);
  expect(saved.inventory).toEqual(before.inventory);
  expect(saved.dropViews).toEqual(before.dropViews);
  await page.getByRole('link', { name: 'Weapons', exact: true }).click();
  await page.getByRole('link', { name: 'Crafting', exact: true }).click();
  await expect(component).not.toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search craftable items' })).toBeVisible();
  await page.getByRole('tab', { name: 'Rhino', exact: true }).click();
  await expect(component).toBeChecked();
  await page.reload();
  await page.getByRole('tab', { name: 'Rhino', exact: true }).click();
  await expect(component).toBeChecked();
  await component.click();
  await expect(polymer).toBeChecked();
  await finishIngredients(page);
  await expect(page.getByRole('progressbar', { name: 'Crafting progress' })).toHaveAttribute('value', '15');
  await expect(page.getByRole('complementary', { name: 'Remaining materials' })).toContainText('Materials gathered.');
  expect((await account.profile()).inventory).toEqual(before.inventory);
});

test('new plans open focused tabs with independent progress, keyboard navigation, and adjacent removal', async ({ page, account }) => {
  await open(page); await page.getByRole('button', { name: 'Craft Rhino', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Crafting', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'About Crafting', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New plan', exact: true })).toHaveCount(0);
  const tabs = page.getByRole('tablist', { name: 'Crafting plans' });
  await expect(tabs.getByRole('tab', { name: 'Rhino', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Add 20 completed Alloy Plate', exact: true }).click();
  await add(page, 'Forma');
  await expect(tabs.getByRole('tab', { name: 'Forma', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.getByRole('tab', { name: 'Forma', exact: true })).toBeFocused();
  await add(page, 'Rhino');
  const first = tabs.getByRole('tab', { name: 'Rhino · Plan 1', exact: true });
  const second = tabs.getByRole('tab', { name: 'Forma', exact: true });
  const third = tabs.getByRole('tab', { name: 'Rhino · Plan 2', exact: true });
  await expect(tabs.getByRole('tab')).toHaveCount(3);
  await expect(page.getByRole('combobox', { name: 'Crafting plan', exact: true })).toHaveCount(0);
  await expect(third).toBeFocused(); await expect(third).toHaveAttribute('aria-selected', 'true');
  const alloy = page.getByRole('slider', { name: 'Completed quantity for Alloy Plate', exact: true });
  await expect(alloy).toHaveValue('0');
  await third.press('Home');
  await expect(first).toBeFocused(); await expect(first).toHaveAttribute('tabindex', '0');
  await expect(third).toHaveAttribute('tabindex', '-1');
  await expect(alloy).toHaveValue('20');
  await first.press('ArrowLeft'); await expect(third).toBeFocused(); await expect(alloy).toHaveValue('0');
  await third.press('ArrowRight'); await expect(first).toBeFocused(); await expect(alloy).toHaveValue('20');
  await first.press('End'); await expect(third).toBeFocused();
  await third.press('ArrowLeft'); await expect(second).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Forma', exact: true })).toBeVisible();
  await expect(page.getByRole('tabpanel')).toHaveCount(1);
  await expect(page.getByRole('tabpanel', { includeHidden: true })).toHaveCount(3);
  expect(await tabs.getByRole('tab').evaluateAll(elements => elements.every(tab => {
    const panel = document.getElementById(tab.getAttribute('aria-controls')!);
    return panel?.getAttribute('aria-labelledby') === tab.id && panel.hidden === (tab.getAttribute('aria-selected') !== 'true');
  }))).toBe(true);
  const saved = await account.profile();
  expect(saved.craftingPlans).toHaveLength(3);
  expect(Object.values(saved.craftingPlans[0].progress!)).toEqual([20]);
  expect(saved.craftingPlans[2].progress ?? {}).toEqual({});
  await page.reload();
  await expect(tabs.getByRole('tab')).toHaveCount(3);
  await expect(page.getByRole('searchbox', { name: 'Search craftable items' })).toBeVisible();
  await first.click(); await expect(alloy).toHaveValue('20');
  await second.click();
  await closeSelected(page);
  await expect(third).toBeFocused(); await expect(third).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.getByRole('tab')).toHaveCount(2); await expect(alloy).toHaveValue('0');
  await closeSelected(page);
  await expect(tabs.getByRole('tab', { name: 'Rhino', exact: true })).toBeFocused();
  await expect(alloy).toHaveValue('20');
  await closeSelected(page);
  await expect(tabs).toHaveCount(0);
  await expect(page.getByRole('searchbox', { name: 'Search craftable items' })).toBeFocused();
  expect((await account.profile()).craftingPlans).toHaveLength(0);
});

test('remaining areas show source alternatives and update with material completion', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: 'Craft Rhino', exact: true }).click();
  const areas = page.getByRole('complementary', { name: 'Areas required to visit', exact: true });
  const remaining = page.getByRole('complementary', { name: 'Remaining materials', exact: true });
  await expect(areas).toContainText('Listed locations are alternatives.');
  await expect(areas).toContainText('Venus, Phobos, Ceres, Jupiter, Pluto, and Sedna');
  expect((await areas.boundingBox())!.y).toBeGreaterThan((await remaining.boundingBox())!.y);
  await expect(areas.getByRole('button', { name: 'Area sources for Polymer Bundle', exact: true })).toHaveCount(1);
  await page.getByRole('checkbox', { name: 'Completed: Rhino Neuroptics', exact: true }).check();
  await expect(areas.getByRole('button', { name: 'Area sources for Alloy Plate', exact: true })).toHaveCount(0);
  await expect(areas.getByRole('button', { name: 'Area sources for Polymer Bundle', exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Completed: Rhino Systems', exact: true }).check();
  await expect(areas.getByRole('button', { name: 'Area sources for Polymer Bundle', exact: true })).toHaveCount(0);
  const completed = page.getByRole('list', { name: 'Completed ingredients for Rhino', exact: true });
  await expect(completed.getByRole('checkbox')).toHaveCount(2);
  await expect(completed.getByRole('checkbox', { name: 'Completed: Rhino Neuroptics', exact: true })).toBeVisible();
  await expect(region(page).locator('details, summary')).toHaveCount(0);
  await expect(region(page)).not.toContainText('Checking a component covers its ingredients.');
  await expect(page.locator('.craft-progress > span').first().locator('svg')).toHaveCount(0);
  await completed.getByRole('checkbox', { name: 'Completed: Rhino Neuroptics', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Completed: Rhino Neuroptics', exact: true })).not.toBeChecked();
  await expect(areas.getByRole('button', { name: 'Area sources for Alloy Plate', exact: true })).toBeVisible();
  await areas.getByRole('button', { name: 'Area sources for Alloy Plate', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Alloy Plate', exact: true })).toContainText('Venus, Phobos, Ceres, Jupiter, Pluto, and Sedna');
  await page.keyboard.press('Escape');
  await finishIngredients(page);
  await expect(areas).toContainText('No areas left to visit.');
  await expect(areas.getByRole('listitem')).toHaveCount(0);
  await add(page, 'Aklex Prime');
  await expect(areas).toContainText('Location not listed');
  await expect(areas.getByRole('button', { name: 'Area sources for Lex Prime Barrel', exact: true })).toBeVisible();
});

test('plans retain gather choices, quantity scaling, and nested weapon requirements', async ({ page, account }) => {
  await open(page);
  await page.getByRole('button', { name: 'Craft Forma', exact: true }).click();
  await page.getByRole('button', { name: /^Sources for Orokin Cell:/ }).click();
  await page.getByRole('dialog', { name: 'Orokin Cell', exact: true }).getByRole('button', { name: 'Use this recipe', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sources for remaining Nano Spores', exact: true })).toContainText('50,000');
  await expect(page.locator('.craft-progress')).toContainText('50,000');
  await add(page, 'Aklex Prime');
  const lex = page.locator('.craft-branch[data-item="Lex Prime"] > .craft-node');
  await expect(lex).toContainText('Consumes equipment');
  await expect(lex.locator('.craft-quantity')).toHaveText('× 2');
  await page.getByRole('checkbox', { name: 'Completed: Lex Prime', exact: true }).check();
  const quantity = page.getByRole('spinbutton', { name: 'Craft quantity' });
  await quantity.fill('2'); await quantity.press('Enter');
  await expect(page.getByRole('checkbox', { name: 'Completed: Lex Prime', exact: true })).not.toBeChecked();
  await expect(lex.locator('.craft-quantity')).toHaveText('× 4');
  await expect(page.locator('.craft-branch[data-item="Lex Prime Barrel"] .craft-quantity')).toHaveText('× 4');
  await page.getByRole('link', { name: 'Weapons', exact: true }).click();
  await page.getByRole('link', { name: 'Crafting', exact: true }).click();
  await page.getByRole('tab', { name: 'Aklex Prime × 2', exact: true }).click();
  await expect(region(page).getByRole('heading', { name: 'Aklex Prime', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Forma', exact: true }).click();
  await expect(page.locator('.craft-branch[data-item="Orokin Cell"] > .craft-node .craft-cost')).toBeVisible();
  await expect(page.getByRole('combobox', { name: /Method for/ })).toHaveCount(0);
  const saved = await account.profile();
  expect(saved.craftingPlans).toHaveLength(2);
  expect(saved.craftingPlans[1].quantity).toBe(2);
  await expect(page.getByRole('button', { name: 'Reset progress', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove plan', exact: true })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Completed: Forma', exact: true })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Completed: Orokin Cell', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Completed: Orokin Cell', exact: true }).uncheck();
  await expect(page.locator('.craft-branch[data-item="Orokin Cell"] > .craft-node .craft-cost')).toBeVisible();
  await closeSelected(page);
  await expect(region(page).getByRole('heading', { name: 'Aklex Prime', exact: true })).toBeVisible();
  expect((await account.profile()).craftingPlans).toHaveLength(1);
});

test('source details distinguish blueprints, exact variants, world locations and unknown drop rates', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Craft Rhino', exact: true }).click();
  const source = page.getByRole('button', { name: /^Sources for Rhino Neuroptics:/ });
  await expect(page.getByRole('button', { name: /^Sources for Ferrite:/ }).first()).toHaveText('Mercury, Earth, Lua, Neptune, and the Void');
  await source.click();
  const dialog = page.getByRole('dialog', { name: 'Rhino Neuroptics', exact: true });
  await expect(dialog).toContainText('Jackal');
  await expect(dialog).toContainText('33.33%');
  await expect(dialog).toContainText('Rhino Neuroptics Blueprint');
  await expect(dialog).not.toContainText('Unrelated Prime source');
  await expect(dialog).toContainText('15,000 credits');
  await expect(dialog.getByRole('region', { name: 'Mining info' })).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: 'Item wiki' })).toHaveAttribute('href', 'https://wiki.warframe.com/w/Rhino');
  await dialog.getByRole('button', { name: 'Close', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Open Drop Tables' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(source).toBeFocused();
  await page.getByRole('button', { name: 'Sources for remaining Ferrite', exact: true }).click();
  const ferrite = page.getByRole('dialog', { name: 'Ferrite', exact: true });
  await expect(ferrite).toContainText('Mercury, Earth, Lua, Neptune, and the Void');
  await expect(ferrite).toContainText('500X Ferrite');
  await expect(ferrite).toContainText('Multiple rolls');
  await expect(ferrite.getByRole('region', { name: 'Mining info' })).toHaveCount(0);
  await expect(ferrite).not.toContainText('Unrelated resource');
  await ferrite.getByRole('button', { name: 'Open Drop Tables' }).click();
  await expect(page).toHaveURL(/#droptables\?view=/);
  await expect(page.locator('.drop-group-title')).toHaveText(['500X Ferrite']);
  await page.getByRole('link', { name: 'Crafting', exact: true }).click();
  await page.getByRole('tab', { name: 'Rhino', exact: true }).click();
  await expect(region(page).getByRole('heading', { name: 'Rhino', exact: true })).toBeVisible();
});

test('mining popups distinguish ore and gem rarities, cutter suggestions, and refined ingredients', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: 'Craft Rhino', exact: true }).click();
  for (const [recipe, name, rarity, cutter, advice] of [
    ['Pyrotic Alloy', 'Pyrol', 'Common ore', 'Nosam Cutter', 'Community recommendation'],
    ['Devolved Namalon', 'Namalon', 'Uncommon ore', 'Nosam Cutter', 'Exact odds by cutter are not published'],
    ['Thaumic Distillate', 'Thaumica', 'Rare ore', 'Sunpoint Plasma Drill', 'All cutters can mine this ore'],
    ['Purified Heciphron', 'Heciphron', 'Uncommon gem', 'Focused Nosam Cutter', 'excludes the rarest gems'],
    ['Radiant Zodian', 'Zodian', 'Very rare gem', 'Sunpoint Plasma Drill', 'Advanced Nosam Cutter also works'],
  ]) {
    await add(page, recipe);
    await page.getByRole('button', { name: `Sources for remaining ${name}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name, exact: true });
    const mining = dialog.getByRole('region', { name: 'Mining info' });
    await expect(mining).toContainText(rarity);
    await expect(mining.getByRole('link', { name: cutter, exact: true })).toHaveAttribute('href', `https://wiki.warframe.com/w/${cutter.replaceAll(' ', '_')}`);
    await expect(mining).toContainText(advice);
    await expect(mining.getByRole('link', { name: 'Mining guide' })).toHaveAttribute('href', 'https://wiki.warframe.com/w/Mining');
    for (const theme of ['dark', 'light']) {
      await page.setViewportSize({ width: 320, height: 800 });
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 1280, height: 720 });
  }
  await page.getByRole('button', { name: /^Sources for Radiant Zodian:/ }).click();
  const refined = page.getByRole('dialog', { name: 'Radiant Zodian', exact: true });
  await expect(refined.getByRole('region', { name: 'Mining info' })).toHaveCount(0);
  await expect(refined.getByRole('region', { name: 'Crafting info' })).toBeVisible();
});

test('failed account writes keep crafting edits until retry succeeds', async ({ page, account }) => {
  await open(page);
  let failing = true;
  await page.route('**/api/account/profile', async route => {
    if (failing) return route.fulfill({ status: 409, json: { error: 'Another session changed this account. Your changes have been kept.' } });
    return route.fallback();
  });
  await page.getByRole('button', { name: 'Craft Rhino', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your changes have been kept');
  await page.getByRole('checkbox', { name: 'Completed: Rhino Neuroptics', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Completed: Rhino Neuroptics', exact: true })).toBeChecked();
  await expect(page.getByRole('alert')).toContainText('Your changes have been kept');
  expect((await account.session()).profile.craftingPlans).toHaveLength(0);
  failing = false;
  await page.getByRole('button', { name: 'Try saving again' }).click();
  expect((await account.profile()).craftingPlans[0].completed).toHaveLength(1);
  await page.reload();
  await page.getByRole('tab', { name: 'Rhino', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Completed: Rhino Neuroptics', exact: true })).toBeChecked();
});

test('a removed recipe stays explicit until the user selects an available one', async ({ page, account }) => {
  const session = await account.session();
  await account.setProfile({ ...session.profile, craftingPlans: [{ id: 'old-plan', itemId: '/Lotus/Powersuits/Rhino/Rhino', quantity: 1, completed: [], choices: { root: '/removed-recipe' } }] });
  await page.goto('/#crafting');
  await page.getByRole('tab', { name: 'Rhino', exact: true }).click();
  await expect(region(page)).toContainText('This recipe is no longer available');
  expect((await account.profile()).craftingPlans[0].choices.root).toBe('/removed-recipe');
  await select(page, 'Recipe', 'Recipe 1 · 25,000 credits');
  await expect(page.getByRole('checkbox', { name: 'Completed: Rhino Neuroptics', exact: true })).toBeVisible();
  expect((await account.profile()).craftingPlans[0].choices.root).not.toBe('/removed-recipe');
});

test('partial quantities reduce nested requirements, save, and restore from compact completed groups', async ({ page, account }) => {
  await open(page);
  const before = await account.inventory();
  await page.getByRole('searchbox', { name: 'Search craftable items' }).fill('Aklex Prime');
  await page.getByRole('button', { name: 'Craft Aklex Prime', exact: true }).click();
  const slider = page.getByRole('slider', { name: 'Completed quantity for Lex Prime', exact: true });
  await slider.focus(); await slider.press('Enter');
  const field = page.getByRole('textbox', { name: 'Completed quantity for Lex Prime value', exact: true });
  await expect(field).toBeFocused(); await field.fill('1'); await field.press('Enter');
  await expect(slider).toHaveValue('1');
  await expect(page.locator('.craft-branch[data-item="Lex Prime Barrel"] .craft-quantity')).toHaveText('× 1');
  const barrel = page.getByRole('slider', { name: 'Completed quantity for Lex Prime Barrel', exact: true });
  await barrel.focus(); await barrel.press('End');
  await expect(barrel).not.toBeVisible();
  expect(Object.values((await account.profile()).craftingPlans[0].progress!)).toEqual([1, 1]);
  await page.reload(); await page.getByRole('tab', { name: 'Aklex Prime', exact: true }).click(); await expect(slider).toHaveValue('1');
  const credits = await page.locator('.craft-progress').textContent();
  await slider.focus(); await slider.press('End');
  const group = page.getByRole('list', { name: 'Completed ingredients for Aklex Prime', exact: true });
  await expect(group.getByRole('checkbox', { name: 'Completed: Lex Prime', exact: true })).toBeFocused();
  await expect(group).toBeVisible();
  await expect(slider).not.toBeVisible();
  expect(await page.locator('.craft-progress').textContent()).not.toBe(credits);
  const completed = page.locator('.craft-completed-item').filter({ hasText: 'Lex Prime' });
  expect((await completed.boundingBox())!.height).toBeLessThan(70);
  await completed.getByRole('checkbox', { name: 'Completed: Lex Prime', exact: true }).click();
  await expect(slider).toHaveValue('0');
  await expect(barrel).toHaveValue('1'); await expect(barrel).toHaveAttribute('max', '2');
  await expect(page.getByRole('checkbox', { name: 'Completed: Lex Prime', exact: true })).toBeFocused();
  expect((await account.profile()).inventory).toEqual(before);
  await page.getByRole('spinbutton', { name: 'Craft quantity', exact: true }).fill('2');
  await page.getByRole('spinbutton', { name: 'Craft quantity', exact: true }).press('Enter');
  await expect(barrel).toHaveValue('0'); await expect(barrel).toHaveAttribute('max', '4');
  expect((await account.profile()).craftingPlans[0].progress).toEqual({});
});

test('quantity popup supports typed entry, native keys, and follows the thumb during normal dragging', async ({ page, account }) => {
  await open(page); await page.getByRole('button', { name: 'Craft Rhino', exact: true }).click();
  const node = page.locator('.craft-branch[data-item="Rhino Chassis"]');
  const slider = node.getByRole('slider', { name: 'Completed quantity for Ferrite', exact: true });
  const field = page.getByRole('textbox', { name: 'Completed quantity for Ferrite value', exact: true });
  await slider.focus(); await slider.press('Enter'); await field.fill('125.6'); await field.press('Enter');
  await expect(slider).toHaveValue('126'); await expect(slider).toBeFocused();
  await slider.press('Enter'); await field.fill('999'); await field.press('Escape');
  await expect(slider).toHaveValue('126'); await expect(slider).toBeFocused();
  await slider.press('Enter'); await field.fill('not a number'); await field.press('Enter');
  await expect(slider).toHaveValue('126');
  await slider.press('Enter'); await field.fill('250'); await page.getByRole('heading', { name: 'Rhino', exact: true }).click();
  await expect(slider).toHaveValue('250');
  await slider.focus(); await slider.press('Home'); await expect(slider).toHaveValue('0');
  await slider.press('ArrowRight'); await expect(slider).toHaveValue('1');
  await slider.press('PageUp'); expect(Number(await slider.inputValue())).toBeGreaterThan(1);
  await slider.press('PageDown'); await expect(slider).toHaveValue('1');
  await slider.press('Enter'); await field.fill('500'); await field.press('Enter'); await account.profile();
  await slider.scrollIntoViewIfNeeded();
  const bounds = (await slider.boundingBox())!, x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  await slider.evaluate(element => {
    element.dataset.inputs = '0'; element.dataset.changes = '0';
    element.addEventListener('input', () => { element.dataset.inputs = String(Number(element.dataset.inputs) + 1); });
    element.addEventListener('change', () => { element.dataset.changes = String(Number(element.dataset.changes) + 1); });
  });
  await page.mouse.move(x, y); await page.mouse.down();
  const popup = page.locator('.quantity-popup');
  await expect(popup.locator('input')).toHaveValue('500');
  const startPopup = (await popup.boundingBox())!;
  expect(startPopup.y + startPopup.height).toBeLessThan(y - 9);
  expect(startPopup.x + startPopup.width / 2).toBeCloseTo(x, 0);
  await page.mouse.move(x, y + 100); await expect(slider).toHaveValue('500');
  await expect(popup.locator('input')).toHaveValue('500');
  await page.mouse.move(x + 20, y + 100);
  const dragged = Number(await slider.inputValue());
  expect(dragged).toBe(Math.round(500 + 20 / (bounds.width - 18) * 1000));
  await expect(popup.locator('input')).toHaveValue(String(dragged));
  const movedPopup = (await popup.boundingBox())!;
  expect(movedPopup.x + movedPopup.width / 2).toBeCloseTo(bounds.x + 9 + dragged / 1000 * (bounds.width - 18), 0);
  expect(movedPopup.y).toBe(startPopup.y);
  expect(Object.values((await account.session()).profile.craftingPlans[0].progress!)).toEqual([500]);
  await page.mouse.up(); await expect(page.locator('.quantity-popup')).toHaveCount(0);
  expect(Number(await slider.getAttribute('data-inputs'))).toBeGreaterThan(0);
  await expect(slider).toHaveAttribute('data-changes', '1');
  expect(Object.values((await account.profile()).craftingPlans[0].progress!)).toEqual([dragged]);
  const thumbX = 9 + dragged / 1000 * (bounds.width - 18);
  await slider.dblclick({ position: { x: thumbX, y: bounds.height / 2 } });
  await expect(field).toBeFocused(); await expect(field).toHaveValue(String(dragged));
  await field.fill('-10'); await field.press('Enter'); await expect(slider).toHaveValue('0');
  await node.getByRole('button', { name: 'Set completed quantity for Ferrite', exact: true }).click();
  await field.fill('2,000'); await field.press('Enter');
  const group = node.getByRole('list', { name: 'Completed ingredients for Rhino Chassis', exact: true });
  await expect(group.getByRole('checkbox', { name: 'Completed: Ferrite', exact: true })).toBeFocused(); await expect(slider).not.toBeVisible();
  await expect(node.getByRole('checkbox', { name: 'Completed: Ferrite', exact: true })).toBeChecked();
});

test('slider arrows add rounded gather quantities, commit once, and save progress', async ({ page, account }) => {
  await open(page); await page.getByRole('button', { name: 'Craft Rhino', exact: true }).click();
  const node = page.locator('.craft-branch[data-item="Rhino Chassis"]');
  const slider = node.getByRole('slider', { name: 'Completed quantity for Ferrite', exact: true });
  const arrow = node.getByRole('button', { name: 'Add 100 completed Ferrite', exact: true });
  await slider.evaluate(element => {
    element.dataset.changes = '0';
    element.addEventListener('change', () => { element.dataset.changes = String(Number(element.dataset.changes) + 1); });
  });
  await arrow.focus(); await expect(page.getByRole('tooltip', { name: '+100', exact: true })).toBeVisible();
  const track = (await slider.boundingBox())!, control = (await arrow.boundingBox())!;
  expect(control.x).toBeGreaterThanOrEqual(track.x + track.width);
  expect(control.width).toBe(28); expect(control.height).toBe(28);
  expect(await arrow.evaluate(element => getComputedStyle(element, '::after').inset)).toBe('-8px');
  await arrow.press('Enter');
  await expect(slider).toHaveValue('100'); await expect(slider).toHaveAttribute('data-changes', '1');
  await arrow.press('Space'); await expect(slider).toHaveValue('200');
  expect(Object.values((await account.profile()).craftingPlans[0].progress!)).toEqual([200]);
  await page.reload(); await page.getByRole('tab', { name: 'Rhino', exact: true }).click(); await expect(slider).toHaveValue('200');
  await page.getByRole('button', { name: 'Add 20 completed Alloy Plate', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Completed quantity for Alloy Plate', exact: true })).toHaveValue('20');
  const rare = page.locator('.craft-branches > .craft-branch[data-item="Neurodes"]');
  await rare.getByRole('button', { name: 'Add 1 completed Neurodes', exact: true }).click();
  await expect(rare).not.toBeVisible();
  await expect(page.getByRole('list', { name: 'Completed ingredients for Rhino', exact: true }).getByRole('checkbox')).toBeFocused();
  await expect(page.getByRole('slider', { name: 'Completed quantity for Neurodes', exact: true })).toHaveValue('0');
});

test('slider arrows use each recipe output and clamp the last Foundry batch', async ({ page, account }) => {
  await open(page); await page.getByRole('button', { name: 'Craft Rhino', exact: true }).click();
  const before = (await account.profile()).inventory;
  await add(page, 'Gara');
  const slider = page.getByRole('slider', { name: 'Completed quantity for Pyrotic Alloy', exact: true });
  await expect(slider).toHaveAttribute('max', '90');
  const arrow = page.getByRole('button', { name: 'Add 20 completed Pyrotic Alloy', exact: true });
  await arrow.hover(); await expect(page.getByRole('tooltip')).toHaveText('+20');
  await arrow.click(); await expect(slider).toHaveValue('20');
  await expect(page.getByRole('slider', { name: 'Completed quantity for Pyrol', exact: true })).toHaveAttribute('max', '80');
  await slider.focus(); await slider.press('Enter');
  const field = page.getByRole('textbox', { name: 'Completed quantity for Pyrotic Alloy value', exact: true });
  await field.fill('85'); await field.press('Enter');
  await page.getByRole('button', { name: 'Add 5 completed Pyrotic Alloy', exact: true }).click();
  await expect(slider).not.toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Completed: Pyrotic Alloy', exact: true })).toBeFocused();
  await add(page, 'Pyrotic Alloy');
  const quantity = page.getByRole('spinbutton', { name: 'Craft quantity', exact: true });
  await quantity.fill('25'); await quantity.press('Enter');
  await page.getByRole('button', { name: 'Add 20 completed Pyrotic Alloy', exact: true }).click();
  await expect(slider).toHaveValue('20');
  await page.getByRole('button', { name: 'Add 5 completed Pyrotic Alloy', exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Completed quantity for Pyrotic Alloy', exact: true })).toHaveValue('25');
  const profile = await account.profile();
  expect(profile.craftingPlans.at(-1)?.progress?.root).toBe(25);
  expect(profile.inventory).toEqual(before);
});

test('source labels and quantity popups fit mobile themes and completed groups stay compact', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await open(page); await page.getByRole('button', { name: 'Craft Rhino', exact: true }).click();
  const source = page.getByRole('button', { name: /^Sources for Alloy Plate:/ });
  await expect(source).toHaveText('Venus, Phobos, Ceres, Jupiter, Pluto, and Sedna.');
  for (const theme of ['dark', 'light']) {
    if (theme === 'light') await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await page.getByRole('button', { name: 'Set completed quantity for Alloy Plate', exact: true }).click();
    const field = page.getByRole('textbox', { name: 'Completed quantity for Alloy Plate value', exact: true });
    await expect(field).toBeFocused();
    const bounds = (await page.locator('.quantity-popup').boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(12); expect(bounds.x + bounds.width).toBeLessThanOrEqual(308);
    await field.fill('50'); await field.press('Enter');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('checkbox', { name: 'Completed: Rhino Neuroptics', exact: true }).click();
  const group = page.getByRole('list', { name: 'Completed ingredients for Rhino', exact: true });
  await expect(group).toBeVisible(); expect((await group.boundingBox())!.height).toBeLessThan(60);
  await expect(page.getByRole('slider', { name: 'Completed quantity for Alloy Plate', exact: true })).not.toBeVisible();
  await page.screenshot({ path: 'test-results/crafting-completed-mobile.png', fullPage: true });
});

test.describe('touch crafting', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('plan tabs wrap on narrow screens and select plans by touch in both themes', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await open(page); await page.getByRole('button', { name: 'Craft Rhino', exact: true }).tap();
    await add(page, 'Aklex Prime'); await add(page, 'Proboscis Cernos');
    const tabs = page.getByRole('tablist', { name: 'Crafting plans' });
    await expect(tabs.getByRole('tab', { name: 'Proboscis Cernos', exact: true })).toHaveAttribute('aria-selected', 'true');
    for (const theme of ['dark', 'light']) {
      if (theme === 'light') await page.getByRole('button', { name: 'Switch to light theme' }).tap();
      await tabs.getByRole('tab', { name: 'Rhino', exact: true }).tap();
      await expect(page.getByRole('tabpanel', { name: 'Rhino', exact: true })).toBeVisible();
      await tabs.getByRole('tab', { name: 'Proboscis Cernos', exact: true }).tap();
      await expect(page.getByRole('tabpanel', { name: 'Proboscis Cernos', exact: true })).toBeVisible();
      const bounds = await tabs.getByRole('tab').evaluateAll(elements => elements.map(element => {
        const { x, y, right } = element.getBoundingClientRect(); return { x, y, right };
      }));
      expect(bounds.at(-1)!.y).toBeGreaterThan(bounds[0].y);
      expect(bounds.every(bound => bound.x >= 0 && bound.right <= 320)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
  test('tapping the value and double-tapping the thumb both open precise quantity entry', async ({ page }) => {
    await open(page); await page.getByRole('button', { name: 'Craft Rhino', exact: true }).tap();
    const slider = page.getByRole('slider', { name: 'Completed quantity for Alloy Plate', exact: true });
    await page.getByRole('button', { name: 'Set completed quantity for Alloy Plate', exact: true }).tap();
    const field = page.getByRole('textbox', { name: 'Completed quantity for Alloy Plate value', exact: true });
    await expect(field).toBeFocused(); await field.fill('75'); await field.press('Enter');
    await expect(slider).toHaveValue('75');
    await page.getByRole('button', { name: 'Add 20 completed Alloy Plate', exact: true }).tap();
    await expect(slider).toHaveValue('95');
    await slider.scrollIntoViewIfNeeded();
    const bounds = (await slider.boundingBox())!;
    const thumbX = bounds.x + 9 + 95 / 150 * (bounds.width - 18);
    await page.touchscreen.tap(thumbX, bounds.y + bounds.height / 2);
    await page.touchscreen.tap(thumbX, bounds.y + bounds.height / 2);
    await expect(field).toBeFocused(); await field.fill('150');
    await page.getByRole('heading', { name: 'Rhino', exact: true }).tap();
    await expect(slider).not.toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Completed: Alloy Plate', exact: true })).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test.describe('guest crafting', () => {
  test.use({ signedIn: false });
  test('mobile plans work with keyboard controls and stay temporary without browser storage', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    const writes: string[] = [];
    page.on('request', request => { if (request.method() === 'PUT' && request.url().includes('/api/account/')) writes.push(request.url()); });
    await open(page);
    await expect(page.getByRole('link', { name: 'Crafting', exact: true })).toHaveAttribute('aria-keyshortcuts', 'Alt+5');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Craft Akjagara', exact: true }).click();
    await expect(region(page).getByRole('heading', { name: 'Akjagara', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const name = (await page.locator('.craft-branches > .craft-branch > .craft-node input[type=checkbox]').first().getAttribute('aria-label'))!;
    const complete = page.getByRole('checkbox', { name, exact: true });
    await complete.focus(); await page.keyboard.press('Space');
    await expect(complete).toBeChecked(); await expect(complete).toBeFocused();
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: /^Sources for Akjagara:/ }).click();
    await expect(page.getByRole('dialog', { name: 'Akjagara', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: 'test-results/crafting-mobile.png', fullPage: true });
    await page.getByRole('link', { name: 'Weapons', exact: true }).click();
    await page.getByRole('link', { name: 'Crafting', exact: true }).click();
    await expect(page.getByRole('searchbox', { name: 'Search craftable items' })).toBeVisible();
    await page.getByRole('tab', { name: 'Akjagara', exact: true }).click();
    await expect(region(page).getByRole('heading', { name: 'Akjagara', exact: true })).toBeVisible();
    expect(writes).toEqual([]);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /craft|inventory|key/i.test(key)))).toEqual([]);
    page.on('dialog', dialog => void dialog.accept());
    await page.reload();
    await expect(page.getByRole('button', { name: 'Craft Rhino', exact: true })).toBeVisible();
  });
});
