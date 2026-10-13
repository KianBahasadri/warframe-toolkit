import { readFileSync } from 'node:fs';
import { test, expect } from './accountFixture';
import type { CraftingPlan } from '../../src/lib/crafting';

const materials: { id: string; name: string }[] = JSON.parse(readFileSync(new URL('../../src/data/crafting.json', import.meta.url), 'utf8')).materials;
const plan = (id: string, name: string, quantity = 1): CraftingPlan => ({ id, itemId: name === 'Rhino' ? '/Lotus/Powersuits/Rhino/Rhino' : materials.find(item => item.name === name)!.id, quantity, completed: [], choices: {} });
const plans = [{ ...plan('rhino-first', 'Rhino', 2), progress: { root: 1 } }, plan('forma', 'Forma'), plan('alloy', 'Pyrotic Alloy', 25), plan('rhino-second', 'Rhino')];
const labels = ['Rhino × 2 · Plan 1', 'Forma', 'Pyrotic Alloy × 25', 'Rhino · Plan 2'];

test('hovering Crafting opens saved plans without stealing focus and selects plans across pages', async ({ page, account }) => {
  const profile = (await account.session()).profile;
  await account.setProfile({ ...profile, craftingPlans: plans });
  await page.goto('/#weapons');
  await expect(page.getByRole('status', { name: 'Save status', exact: true })).toHaveText('Saved');
  const trigger = page.getByRole('link', { name: 'Crafting', exact: true });
  const menu = page.getByRole('menu', { name: 'Open crafting plans' });
  const search = page.getByLabel('Search weapons', { exact: true });
  await search.focus(); await trigger.hover();
  await expect(menu.getByRole('menuitem')).toHaveText(labels);
  await expect(search).toBeFocused(); await expect(page).toHaveURL(/#weapons$/);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await menu.getByRole('menuitem', { name: labels[0], exact: true }).hover();
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitem', { name: labels[0], exact: true }).click();
  await expect(menu).toHaveCount(0); await expect(page).toHaveURL(/#crafting$/);
  await expect(page.getByRole('tabpanel', { name: labels[0], exact: true })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Completed quantity for Rhino', exact: true })).toHaveValue('1');
  await trigger.hover();
  await expect(menu.getByRole('menuitem', { name: labels[0], exact: true })).toHaveAttribute('aria-current', 'page');
  await menu.getByRole('menuitem', { name: 'Forma', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Forma', exact: true })).toBeVisible();
  await trigger.click();
  await expect(page.getByRole('searchbox', { name: 'Search craftable items' })).toBeVisible();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('tab')).toHaveText(labels);
  expect((await account.profile()).craftingPlans).toEqual(plans);
  await page.goBack(); await expect(page).toHaveURL(/#weapons$/);
});

test('plan dropdown supports keyboard traversal, escape, tab, pointer exit, and outside dismissal', async ({ page, account }) => {
  await account.setProfile({ ...(await account.session()).profile, craftingPlans: plans });
  await page.goto('/#crafting');
  await expect(page.getByRole('tab')).toHaveCount(plans.length);
  const trigger = page.getByRole('link', { name: 'Crafting', exact: true });
  const menu = page.getByRole('menu', { name: 'Open crafting plans' });
  await trigger.focus(); await trigger.press('ArrowDown');
  const first = menu.getByRole('menuitem', { name: labels[0], exact: true });
  const last = menu.getByRole('menuitem', { name: labels.at(-1)!, exact: true });
  await expect(first).toBeFocused();
  await first.press('ArrowUp'); await expect(last).toBeFocused();
  await last.press('ArrowDown'); await expect(first).toBeFocused();
  await first.press('End'); await expect(last).toBeFocused();
  await last.press('Home'); await expect(first).toBeFocused();
  await first.press('Escape'); await expect(menu).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.press('ArrowUp'); await expect(last).toBeFocused();
  await last.press('Shift+Tab'); await expect(trigger).toBeFocused(); await expect(menu).toHaveCount(0);
  await trigger.press('Space'); await expect(first).toBeFocused();
  await first.press('Tab'); await expect(page.getByRole('button', { name: 'Open search and commands' })).toBeFocused();
  await expect(menu).toHaveCount(0);
  await trigger.hover(); await expect(menu).toBeVisible();
  await page.getByRole('heading', { name: 'Choose an item', exact: true }).hover();
  await expect(menu).toHaveCount(0);
  await trigger.hover(); await expect(menu).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search craftable items' }).click();
  await expect(menu).toHaveCount(0);
  await trigger.focus(); await trigger.press('ArrowDown'); await first.press('Enter');
  await expect(page.getByRole('tabpanel', { name: labels[0], exact: true })).toBeVisible();
});

test('long plan menus scroll within the viewport and retain keyboard focus in both themes', async ({ page, account }) => {
  const many = Array.from({ length: 50 }, (_, index) => plan(`plan-${index}`, 'Rhino', index + 1));
  many[49].itemId = '/removed-item';
  await account.setProfile({ ...(await account.session()).profile, craftingPlans: many });
  await page.goto('/#weapons');
  await expect(page.getByRole('status', { name: 'Save status', exact: true })).toHaveText('Saved');
  const trigger = page.getByRole('link', { name: 'Crafting', exact: true });
  const menu = page.getByRole('menu', { name: 'Open crafting plans' });
  for (const width of [1280, 320]) for (const theme of ['dark', 'light']) {
    await page.setViewportSize({ width, height: 800 });
    await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
    await trigger.focus(); await trigger.press('ArrowUp');
    const last = menu.getByRole('menuitem', { name: 'Unavailable item × 50', exact: true });
    await expect(last).toBeFocused(); await expect(last).toBeInViewport();
    const bounds = (await menu.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(12); expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - 12);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(788);
    expect(await menu.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await last.press('Home'); await expect(menu.getByRole('menuitem').first()).toBeFocused();
    await expect(menu.getByRole('menuitem').first()).toBeInViewport();
    await page.keyboard.press('Escape');
  }
});

test('the plan list updates after creation and removal and clears after sign-out', async ({ page, account }) => {
  await page.goto('/#crafting');
  const trigger = page.getByRole('link', { name: 'Crafting', exact: true });
  const menu = page.getByRole('menu', { name: 'Open crafting plans' });
  await trigger.hover(); await expect(menu).toHaveText('No open plans.');
  await page.getByRole('button', { name: 'Craft Rhino', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Rhino', exact: true })).toBeVisible();
  await trigger.hover(); await expect(menu.getByRole('menuitem')).toHaveText(['Rhino']);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Remove plan', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Remove plan', exact: true }).click();
  await trigger.hover(); await expect(menu).toHaveText('No open plans.');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Craft Forma', exact: true }).click();
  await account.profile();
  await trigger.hover(); await expect(menu.getByRole('menuitem')).toHaveText(['Forma']);
  await account.signOut(); await page.reload();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await trigger.hover(); await expect(menu).toHaveText('No open plans.');
});
