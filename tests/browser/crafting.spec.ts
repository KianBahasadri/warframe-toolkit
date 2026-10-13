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
  await page.getByRole('button', { name: 'New plan', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New crafting plan', exact: true });
  await dialog.getByRole('searchbox', { name: 'Search craftable items' }).fill(name);
  await dialog.getByRole('button', { name: `Craft ${name}`, exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(region(page).getByRole('heading', { name, exact: true })).toBeVisible();
}

test('ingredient completion is independent by branch, saves across navigation and reload, and preserves inventory', async ({ page, account }) => {
  await open(page);
  const before = await account.profile();
  await page.getByRole('button', { name: 'Craft Rhino', exact: true }).click();
  const neuroptics = page.locator('.craft-branch[data-item="Rhino Neuroptics"]');
  const systems = page.locator('.craft-branch[data-item="Rhino Systems"]');
  const polymer = neuroptics.getByRole('checkbox', { name: 'Completed: Polymer Bundle', exact: true });
  const component = page.getByRole('checkbox', { name: 'Completed: Rhino Neuroptics', exact: true });
  await polymer.check();
  await expect(systems.getByRole('checkbox', { name: 'Completed: Polymer Bundle', exact: true })).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Sources for remaining Polymer Bundle', exact: true })).toContainText('100');
  await component.check();
  await expect(polymer).not.toBeVisible();
  await expect(page.locator('.craft-progress')).toContainText('55,000');
  const saved = await account.profile();
  expect(saved.craftingPlans[0].completed).toHaveLength(2);
  expect(saved.inventory).toEqual(before.inventory);
  expect(saved.dropViews).toEqual(before.dropViews);
  await page.getByRole('link', { name: 'Weapons', exact: true }).click();
  await page.getByRole('link', { name: 'Crafting', exact: true }).click();
  await expect(component).toBeChecked();
  await page.reload();
  await expect(component).toBeChecked();
  await component.uncheck();
  await expect(polymer).toBeChecked();
  await page.getByRole('checkbox', { name: 'Completed: Rhino', exact: true }).check();
  await expect(page.getByRole('progressbar', { name: 'Crafting progress' })).toHaveAttribute('value', '16');
  await expect(page.getByRole('complementary', { name: 'Remaining materials' })).toContainText('Nothing left to gather.');
  expect((await account.profile()).inventory).toEqual(before.inventory);
});

test('plans retain gather choices, quantity scaling, and nested weapon requirements', async ({ page, account }) => {
  await open(page);
  await page.getByRole('button', { name: 'Craft Forma', exact: true }).click();
  await select(page, 'Method for Orokin Cell', 'Craft');
  await expect(page.getByRole('button', { name: 'Sources for remaining Nano Spores', exact: true })).toContainText('50,000');
  await expect(page.locator('.craft-progress')).toContainText('50,000');
  await add(page, 'Aklex Prime');
  const lex = page.locator('.craft-branch[data-item="Lex Prime"] > .craft-node');
  await expect(lex).toContainText('Consumes equipment');
  await expect(lex.locator('.craft-quantity')).toHaveText('× 2');
  await page.getByRole('checkbox', { name: 'Completed: Aklex Prime', exact: true }).check();
  const quantity = page.getByRole('spinbutton', { name: 'Craft quantity' });
  await quantity.fill('2'); await quantity.press('Enter');
  await expect(page.getByRole('checkbox', { name: 'Completed: Aklex Prime', exact: true })).not.toBeChecked();
  await expect(lex.locator('.craft-quantity')).toHaveText('× 4');
  await expect(page.locator('.craft-branch[data-item="Lex Prime Barrel"] .craft-quantity')).toHaveText('× 4');
  await page.getByRole('link', { name: 'Weapons', exact: true }).click();
  await page.getByRole('link', { name: 'Crafting', exact: true }).click();
  await expect(region(page).getByRole('heading', { name: 'Aklex Prime', exact: true })).toBeVisible();
  await select(page, 'Crafting plan', 'Forma');
  await expect(page.getByRole('combobox', { name: 'Method for Orokin Cell', exact: true })).toHaveText('Craft');
  const saved = await account.profile();
  expect(saved.craftingPlans).toHaveLength(2);
  expect(saved.craftingPlans[1].quantity).toBe(2);
  await page.getByRole('checkbox', { name: 'Completed: Forma', exact: true }).check();
  await page.getByRole('button', { name: 'Reset progress', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset progress', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Completed: Forma', exact: true })).not.toBeChecked();
  await expect(page.getByRole('combobox', { name: 'Method for Orokin Cell', exact: true })).toHaveText('Craft');
  await page.getByRole('button', { name: 'Remove plan', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await account.profile()).craftingPlans).toHaveLength(2);
  await page.getByRole('button', { name: 'Remove plan', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove plan', exact: true }).click();
  await expect(region(page).getByRole('heading', { name: 'Aklex Prime', exact: true })).toBeVisible();
  expect((await account.profile()).craftingPlans).toHaveLength(1);
});

test('source details distinguish blueprints, exact variants, world locations and unknown drop rates', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Craft Rhino', exact: true }).click();
  const source = page.getByRole('button', { name: 'Sources for Rhino Neuroptics', exact: true });
  await source.click();
  const dialog = page.getByRole('dialog', { name: 'Rhino Neuroptics', exact: true });
  await expect(dialog).toContainText('Jackal');
  await expect(dialog).toContainText('33.33%');
  await expect(dialog).toContainText('Rhino Neuroptics Blueprint');
  await expect(dialog).not.toContainText('Unrelated Prime source');
  await expect(dialog).toContainText('15,000 credits');
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
  await expect(ferrite).not.toContainText('Unrelated resource');
  await ferrite.getByRole('button', { name: 'Open Drop Tables' }).click();
  await expect(page).toHaveURL(/#droptables\?view=/);
  await expect(page.locator('.drop-group-title')).toHaveText(['500X Ferrite']);
  await page.getByRole('link', { name: 'Crafting', exact: true }).click();
  await expect(region(page).getByRole('heading', { name: 'Rhino', exact: true })).toBeVisible();
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
  await page.getByRole('checkbox', { name: 'Completed: Rhino Neuroptics', exact: true }).check();
  await expect(page.getByRole('checkbox', { name: 'Completed: Rhino Neuroptics', exact: true })).toBeChecked();
  await expect(page.getByRole('alert')).toContainText('Your changes have been kept');
  expect((await account.session()).profile.craftingPlans).toHaveLength(0);
  failing = false;
  await page.getByRole('button', { name: 'Try saving again' }).click();
  expect((await account.profile()).craftingPlans[0].completed).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Completed: Rhino Neuroptics', exact: true })).toBeChecked();
});

test('a removed recipe stays explicit until the user selects an available one', async ({ page, account }) => {
  const session = await account.session();
  await account.setProfile({ ...session.profile, craftingPlans: [{ id: 'old-plan', itemId: '/Lotus/Powersuits/Rhino/Rhino', quantity: 1, completed: [], choices: { root: '/removed-recipe' } }] });
  await page.goto('/#crafting');
  await expect(region(page)).toContainText('This recipe is no longer available');
  expect((await account.profile()).craftingPlans[0].choices.root).toBe('/removed-recipe');
  await select(page, 'Recipe', 'Recipe 1 · 25,000 credits');
  await expect(page.getByRole('checkbox', { name: 'Completed: Rhino Neuroptics', exact: true })).toBeVisible();
  expect((await account.profile()).craftingPlans[0].choices.root).not.toBe('/removed-recipe');
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
    const complete = page.getByRole('checkbox', { name: 'Completed: Akjagara', exact: true });
    await complete.focus(); await page.keyboard.press('Space'); await expect(complete).toBeChecked();
    await page.keyboard.press('Space'); await expect(complete).not.toBeChecked();
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'Blueprint & sources', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Akjagara', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await page.screenshot({ path: 'test-results/crafting-mobile.png', fullPage: true });
    await page.getByRole('link', { name: 'Weapons', exact: true }).click();
    await page.getByRole('link', { name: 'Crafting', exact: true }).click();
    await expect(region(page).getByRole('heading', { name: 'Akjagara', exact: true })).toBeVisible();
    expect(writes).toEqual([]);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /craft|inventory|key/i.test(key)))).toEqual([]);
    page.on('dialog', dialog => void dialog.accept());
    await page.reload();
    await expect(page.getByRole('button', { name: 'Craft Rhino', exact: true })).toBeVisible();
  });
});
