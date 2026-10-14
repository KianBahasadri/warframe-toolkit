import { test, expect } from './accountFixture';
import type { Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/#modder');
  await expect(page.getByRole('button', { name: 'Mod 1: empty', exact: true })).toBeEnabled();
}
async function equip(page: Page, slot: string, name: string) {
  await page.getByRole('button', { name: new RegExp(`^${slot}:`) }).click();
  await page.getByRole('searchbox', { name: 'Search mods and effects' }).fill(name);
  await page.getByRole('button', { name: `Equip ${name}`, exact: true }).click();
}
async function select(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('listbox', { name: label, exact: true }).getByRole('option', { name: option, exact: true }).click();
}
const result = (page: Page, label: string) => page.locator(`[data-result="${label}"]`);

test('whole loadout ranks, shared arcanes, formulas and comparisons save without changing inventory', async ({ page, account }) => {
  await open(page); const before = await account.profile();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link').last()).toHaveText('Modding Calculator');
  await page.getByRole('textbox', { name: 'Arsenal name', exact: true }).fill('');
  await expect(page.getByRole('textbox', { name: 'Arsenal name', exact: true })).toHaveValue('');
  await page.getByRole('textbox', { name: 'Arsenal name', exact: true }).fill('Workshop A');
  await equip(page, 'Mod 1', 'Vitality');
  await expect(result(page, 'Health')).toHaveText('740');
  await page.getByRole('spinbutton', { name: 'Mod 1 rank', exact: true }).fill('0');
  await expect(result(page, 'Health')).toHaveText('403.64');
  await equip(page, 'Arcane 1', 'Arcane Avenger');
  await page.getByRole('spinbutton', { name: 'Arcane 1 active stacks', exact: true }).fill('1');
  await page.getByRole('button', { name: 'Edit primary', exact: true }).click();
  await equip(page, 'Mod 1', 'Serration');
  await expect(result(page, 'Critical chance')).toHaveText('57 %');
  await expect(result(page, 'Damage / projectile')).toHaveText('63.6');
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  await expect(page.locator('.modder-equation').filter({ hasText: 'Serration · rank 10' }).first()).toContainText('+165%');
  await page.getByRole('spinbutton', { name: 'Mod 1 rank', exact: true }).fill('0');
  await expect(result(page, 'Damage / projectile')).toHaveText('27.6');
  await page.getByRole('button', { name: 'Edit secondary', exact: true }).click(); await equip(page, 'Mod 1', 'Hornet Strike');
  await page.getByRole('button', { name: 'Edit melee', exact: true }).click(); await equip(page, 'Mod 1', 'Pressure Point');
  const saved = await account.profile();
  expect(saved.inventory).toEqual(before.inventory); expect(saved.craftingPlans).toEqual(before.craftingPlans); expect(saved.dropViews).toEqual(before.dropViews);
  expect(saved.arsenals).toHaveLength(1);
  for (const slot of ['Warframe', 'Primary', 'Secondary', 'Melee'] as const) expect(saved.arsenals[0].equipment[slot].mods[0].id).not.toBe('');
  await page.getByRole('button', { name: 'Edit primary', exact: true }).click();
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Mod 1 rank', exact: true }).fill('10');
  await expect(page.getByRole('complementary', { name: 'Calculated results' })).toContainText('Changes from Workshop A');
  await expect(page.locator('.modder-calculations details').filter({ has: result(page, 'Damage / projectile') }).locator('.modder-delta')).toHaveText('+36');
  await account.profile(); await page.reload();
  await select(page, 'Arsenal build', 'Workshop A (copy)');
  await page.getByRole('button', { name: 'Edit primary', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'Mod 1 rank', exact: true })).toHaveValue('10');
  await page.getByRole('link', { name: 'Weapons', exact: true }).click(); await page.getByRole('link', { name: 'Modding Calculator', exact: true }).click();
  expect((await account.profile()).arsenals).toHaveLength(2);
});

test('mod ordering, compatibility, capacity and active stacks remain inspectable', async ({ page, account }) => {
  await page.setViewportSize({ width: 1600, height: 1100 }); await open(page);
  await page.getByRole('button', { name: 'Edit primary', exact: true }).click();
  for (const [i, name] of ['Serration', 'Split Chamber', 'Point Strike', 'Vital Sense', 'Infected Clip', 'Cryo Rounds', 'Hellfire', 'Fast Hands'].entries()) {
    await equip(page, `Mod ${i + 1}`, name);
    await select(page, `Mod ${i + 1} polarity`, ['Madurai', 'Madurai', 'Madurai', 'Madurai', 'Naramon', 'Vazarin', 'Naramon', 'Naramon'][i]);
  }
  await expect(page.getByRole('meter', { name: 'Viral damage', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Adjust mod 7', exact: true }).click();
  await page.getByRole('button', { name: 'Move mod 7 earlier', exact: true }).click();
  await expect(page.getByRole('meter', { name: 'Gas damage', exact: true })).toBeVisible();
  await expect(page.getByRole('meter', { name: 'Cold damage', exact: true })).toBeVisible();
  await select(page, 'Mod 6 polarity', 'Naramon');
  await page.getByRole('button', { name: 'Adjust mod 7', exact: true }).click();
  await select(page, 'Mod 7 polarity', 'Vazarin');
  await equip(page, 'Arcane 1', 'Primary Merciless');
  const before = await result(page, 'Damage / projectile').textContent();
  await page.getByRole('spinbutton', { name: 'Arcane 1 active stacks', exact: true }).fill('12');
  await expect(result(page, 'Damage / projectile')).not.toHaveText(before!);
  await page.getByRole('button', { name: 'Mod 3: Point Strike', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search mods and effects' }).fill('Hell');
  await expect(page.getByRole('button', { name: "Equip Hell's Chamber", exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Mod 8: Fast Hands', exact: true }).click();
  await page.getByRole('searchbox', { name: 'Search mods and effects' }).fill('Critical Delay');
  await expect(page.getByRole('button', { name: 'Equip Critical Delay', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('checkbox', { name: 'Orokin Catalyst', exact: true }).uncheck();
  await expect(page.locator('.modder-editor .callout')).toContainText('Over capacity by');
  await page.getByRole('checkbox', { name: 'Orokin Catalyst', exact: true }).check();
  await page.getByRole('button', { name: 'Expand all', exact: true }).click();
  await page.screenshot({ path: 'test-results/modder-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  await page.screenshot({ path: 'test-results/modder-desktop-light.png', fullPage: true });
  expect((await account.profile()).arsenals[0].equipment.Primary.mods).toHaveLength(8);
});

test('dragging from the tray and swapping slots preserves settings; right-click removes and saves', async ({ page, account }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await open(page);
  await expect(page.locator('.modder-equipment-backdrop')).toHaveCount(0);
  const library = page.getByRole('region', { name: 'Compatible upgrades' });
  await library.getByRole('searchbox').fill('Intensify');
  await library.getByRole('button', { name: 'Install Intensify', exact: true }).dragTo(page.getByRole('button', { name: 'Mod 5: empty', exact: true }));
  await expect(page.getByRole('button', { name: 'Mod 5: Intensify', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await select(page, 'Mod 5 polarity', 'Madurai');
  await page.getByRole('spinbutton', { name: 'Mod 5 rank', exact: true }).fill('0');
  await page.getByRole('checkbox', { name: 'Include mod 5', exact: true }).uncheck();
  await equip(page, 'Mod 1', 'Vitality');
  await select(page, 'Mod 1 polarity', 'Vazarin');
  const before = await account.profile(), mods = before.arsenals[0].equipment.Warframe.mods;
  await page.locator('.modder-upgrade-stage').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Mod 5: Intensify', exact: true }).dragTo(page.getByRole('button', { name: 'Mod 1: Vitality', exact: true }));
  await expect(page.getByRole('button', { name: 'Mod 5: Vitality', exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: 'Mod 1 rank', exact: true })).toHaveValue('0');
  await expect(page.getByRole('checkbox', { name: 'Include mod 1', exact: true })).not.toBeChecked();
  const swapped = (await account.profile()).arsenals[0].equipment.Warframe.mods;
  expect(swapped[0]).toEqual({ ...mods[4], polarity: 'vazarin' });
  expect(swapped[4]).toEqual({ ...mods[0], polarity: 'madurai' });
  await page.getByRole('button', { name: 'Mod 1: Intensify', exact: true }).dragTo(page.getByRole('button', { name: 'Mod 8: empty', exact: true }));
  await expect(page.getByRole('button', { name: 'Mod 1: empty', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mod 8: Intensify', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mod 8: Intensify', exact: true }).click({ button: 'right' });
  await expect(page.getByRole('button', { name: 'Mod 8: empty', exact: true })).toBeVisible();
  await expect(page.locator('.is-drop-allowed, .is-drop-target, .is-drag-source')).toHaveCount(0);
  const removed = await account.profile();
  expect(removed.inventory).toEqual(before.inventory);
  expect(removed.arsenals[0].equipment.Warframe.mods[0]).toEqual({ id: '', rank: 0, enabled: true, stacks: 0, polarity: 'vazarin' });
  expect(removed.arsenals[0].equipment.Warframe.mods[7].id).toBe('');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mod 5: Vitality', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mod 8: empty', exact: true })).toBeVisible();
});

test('dragging validates the actual destination and leaves incompatible or cancelled moves untouched', async ({ page, account }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await open(page);
  await equip(page, 'Mod 1', 'Flow');
  await page.getByRole('button', { name: 'Adjust mod 2', exact: true }).click();
  const library = page.getByRole('region', { name: 'Compatible upgrades' });
  await library.getByRole('searchbox').fill('Primed Flow');
  const primed = library.getByRole('button', { name: 'Install Primed Flow', exact: true });
  await expect(primed).toHaveAttribute('aria-disabled', 'true');
  await primed.dragTo(page.getByRole('button', { name: 'Mod 1: Flow', exact: true }));
  await expect(page.getByRole('button', { name: 'Mod 1: Primed Flow', exact: true })).toBeVisible();
  await equip(page, 'Exilus', 'Power Drift');
  const before = (await account.profile()).arsenals;
  await page.locator('.modder-upgrade-stage').scrollIntoViewIfNeeded();
  const flow = page.getByRole('button', { name: 'Mod 1: Primed Flow', exact: true });
  const exilus = page.getByRole('button', { name: 'Exilus: Power Drift', exact: true });
  await flow.dragTo(exilus);
  await exilus.dragTo(flow); // The displaced Flow cannot fit Exilus either.
  await flow.hover();
  const bounds = (await flow.boundingBox())!, x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
  await page.mouse.down();
  await page.mouse.move(x + 20, y, { steps: 4 });
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await flow.dragTo(page.getByRole('heading', { name: 'Upgrades / Excalibur' }));
  await expect(page.locator('.is-drop-allowed, .is-drop-target, .is-drag-source')).toHaveCount(0);
  expect((await account.profile()).arsenals).toEqual(before);

  await exilus.dragTo(page.getByRole('button', { name: 'Mod 2: empty', exact: true }));
  await expect(page.getByRole('button', { name: 'Exilus: empty', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mod 2: Power Drift', exact: true })).toBeVisible();
  await library.getByRole('searchbox').fill('Flow');
  await library.getByRole('button', { name: 'Install Flow', exact: true }).dragTo(page.getByRole('button', { name: 'Mod 3: empty', exact: true }));
  await expect(page.getByRole('button', { name: 'Mod 3: empty', exact: true })).toBeVisible();
  await expect(flow).toBeVisible();
  await page.getByRole('button', { name: 'Mod 2: Power Drift', exact: true }).dragTo(page.getByRole('button', { name: 'Exilus: empty', exact: true }));
  await expect(exilus).toBeVisible();
  await exilus.click({ button: 'right' });
  await expect(page.getByRole('button', { name: 'Exilus: empty', exact: true })).toBeVisible();
});

test('arcanes drag between slots with active stacks and right-click clears special slots', async ({ page, account }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await open(page);
  await equip(page, 'Aura', 'Steel Charge');
  await select(page, 'Aura polarity', 'Madurai');
  await page.getByRole('button', { name: 'Aura: Steel Charge', exact: true }).click({ button: 'right' });
  await expect(page.getByRole('button', { name: 'Aura: empty', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Aura polarity', exact: true })).toContainText('Madurai');
  await equip(page, 'Arcane 1', 'Arcane Avenger');
  await page.getByRole('spinbutton', { name: 'Arcane 1 rank', exact: true }).fill('0');
  await page.getByRole('spinbutton', { name: 'Arcane 1 active stacks', exact: true }).fill('1');
  await page.locator('.modder-upgrade-stage').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Arcane 1: Arcane Avenger', exact: true }).dragTo(page.getByRole('button', { name: 'Arcane 2: empty', exact: true }));
  await expect(page.getByRole('spinbutton', { name: 'Arcane 2 rank', exact: true })).toHaveValue('0');
  await expect(page.getByRole('spinbutton', { name: 'Arcane 2 active stacks', exact: true })).toHaveValue('1');
  await expect(page.getByRole('button', { name: 'Arcane 1: empty', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Arcane 2: Arcane Avenger', exact: true }).click({ button: 'right' });
  expect((await account.profile()).arsenals[0].equipment.Warframe.arcanes.every(arcane => !arcane.id)).toBe(true);
});

test.describe('guest workshop', () => {
  test.use({ signedIn: false });
  test('Arsenal layout and dock equip the selected slot with exact polarity and rank controls', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 1100 });
    await open(page);
    const aura = await page.getByRole('button', { name: 'Aura: empty', exact: true }).boundingBox();
    const first = await page.getByRole('button', { name: 'Mod 1: empty', exact: true }).boundingBox();
    const fourth = await page.getByRole('button', { name: 'Mod 4: empty', exact: true }).boundingBox();
    const fifth = await page.getByRole('button', { name: 'Mod 5: empty', exact: true }).boundingBox();
    const arcane = await page.getByRole('button', { name: 'Arcane 1: empty', exact: true }).boundingBox();
    const stats = await page.getByRole('complementary', { name: 'Arsenal and stats' }).boundingBox();
    expect(aura!.y + aura!.height).toBeLessThan(first!.y);
    expect(Math.abs(first!.y - fourth!.y)).toBeLessThan(1);
    expect(fifth!.y).toBeGreaterThan(first!.y);
    expect(arcane!.x).toBeGreaterThan(fourth!.x);
    expect(stats!.x + stats!.width).toBeLessThan(first!.x);

    await page.getByRole('button', { name: 'Adjust mod 5', exact: true }).click();
    const library = page.getByRole('region', { name: 'Compatible upgrades' });
    await library.getByRole('searchbox', { name: 'Search compatible upgrades' }).fill('Intensify');
    await library.getByRole('button', { name: 'Vazarin polarity', exact: true }).click();
    await expect(library.getByRole('button', { name: 'Install Intensify', exact: true })).toHaveCount(0);
    await library.getByRole('button', { name: 'Madurai polarity', exact: true }).click();
    await library.getByRole('button', { name: 'Install Intensify', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mod 5: Intensify', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mod 1: empty', exact: true })).toBeVisible();
    await expect(page.locator('[data-arsenal-stat="Ability strength"]')).toHaveText('130 %');
    await select(page, 'Mod 5 polarity', 'Madurai');
    await expect(page.getByRole('button', { name: 'Mod 5: Intensify', exact: true }).locator('.modder-face-drain')).toHaveText('6');
    await page.getByRole('spinbutton', { name: 'Mod 5 rank', exact: true }).fill('0');
    await expect(page.locator('[data-arsenal-stat="Ability strength"]')).toHaveText('105 %');
    await page.getByRole('checkbox', { name: 'Include mod 5', exact: true }).uncheck();
    await expect(page.locator('[data-arsenal-stat="Ability strength"]')).toHaveText('100 %');
    await expect(page.getByRole('button', { name: 'Adjust mod 5', exact: true })).toContainText('Excluded');
    await page.getByRole('button', { name: 'Remove mod 5', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mod 5: empty', exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Mod 5 polarity', exact: true })).toHaveText('Madurai');
  });
  test('mobile editing keeps live results available and stores no builds or access keys', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 }); await open(page);
    await equip(page, 'Mod 1', 'Intensify');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('slider', { name: 'Mod 1 rank slider', exact: true }).focus(); await page.keyboard.press('Home');
    await expect(page.getByRole('spinbutton', { name: 'Mod 1 rank', exact: true })).toHaveValue('0');
    await expect(page.locator('.modder-mobile-results')).toContainText('105 %');
    await page.getByRole('button', { name: 'Results', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Calculated results' })).toBeFocused();
    await page.getByRole('button', { name: 'Edit primary', exact: true }).click();
    await page.getByRole('button', { name: 'Mod 1: empty', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search mods and effects' }).fill('Serration');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Equip Serration', exact: true }).click();
    await page.screenshot({ path: 'test-results/modder-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    await page.getByRole('button', { name: 'Mod 1: Serration', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/modder-mobile-picker-light.png', fullPage: true });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Mod 1: Serration', exact: true })).toBeFocused();
    await page.getByRole('link', { name: 'Weapons', exact: true }).click(); await page.getByRole('link', { name: 'Modding Calculator', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mod 1: Intensify', exact: true })).toBeVisible();
    expect(await page.evaluate(() => Object.keys(localStorage).filter(key => /arsenal|modder|key/i.test(key) && key !== 'arsenal.theme'))).toEqual([]);
    page.on('dialog', dialog => void dialog.accept()); await page.reload();
    await expect(page.getByRole('button', { name: 'Mod 1: empty', exact: true })).toBeVisible();
  });
});
