import { test, expect } from './accountFixture';
import type { Page } from '@playwright/test';
import { createEquipment } from '../../src/lib/model';
import { createRelic } from '../../src/lib/relics';

const header = (page: Page, name: string) => page.getByRole('columnheader').filter({ has: page.getByRole('button', { name: `${name} column options`, exact: true }) });
const order = (page: Page) => page.locator('.inventory-table th').evaluateAll(cells => cells.map(cell => (cell as HTMLElement).dataset.columnKey));
const menu = (page: Page) => page.getByRole('menu', { name: /Column actions for/ });
const equipmentOrder = ['name', 'owned', 'rank', 'mastered', 'incarnon', 'upgraded', 'keep', 'craftingTarget'];

async function dragColumn(page: Page, source: string, target: string, edge: 'before' | 'after') {
  const from = (await header(page, source).boundingBox())!;
  const to = (await header(page, target).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + (edge === 'before' ? 8 : to.width - 8), to.y + to.height / 2, { steps: 12 });
  await expect(header(page, source)).toHaveAttribute('data-dragging', 'true');
  await expect(header(page, target)).toHaveAttribute('data-drop-edge', edge);
  await page.mouse.up();
  await expect(menu(page)).toHaveCount(0);
}

test('dragged columns keep their data, filters, and saved order across equipment tabs and relics', async ({ page, account }) => {
  await page.setViewportSize({ width: 1800, height: 900 });
  await page.goto('/');
  const inventory = await account.inventory();
  inventory.items = [
    createEquipment({ name: 'Boltor', slot: 'Primary', variant: 'Base' }, { rank: 9 }),
    createEquipment({ name: 'Bo', slot: 'Melee', variant: 'Base' }, { rank: 30 }),
    createEquipment({ name: 'Wisp Prime', slot: 'Warframe', variant: 'Prime' }, { rank: 20 }),
  ];
  inventory.relics = [{ ...createRelic(), name: 'Lith A1', quantity: 3 }];
  await account.setInventory(inventory);
  await page.reload();
  const saved = JSON.stringify(await account.inventory());
  await header(page, 'Rank').click();
  await menu(page).getByRole('menuitemradio', { name: 'Sort descending' }).click();
  await header(page, 'Rank').click();
  await menu(page).getByRole('menuitem', { name: 'Set filter' }).click();
  await page.getByRole('spinbutton', { name: 'Filter rank' }).fill('30');
  await page.getByRole('button', { name: 'Apply filter' }).click();
  await dragColumn(page, 'Rank', 'Owned', 'before');
  await expect.poll(() => order(page)).toEqual(['name', 'rank', 'owned', ...equipmentOrder.slice(3)]);
  await expect(page.getByRole('button', { name: 'Rank column options' })).toHaveAccessibleDescription('Sort priority 1 of 1, descending');
  await expect(page.locator('.inventory-table .equipment-label')).toHaveText(['Bo']);
  await expect(page.locator('tbody tr').first().getByRole('cell').nth(1)).toHaveText('30');
  await expect(page.getByRole('group', { name: 'Column filters', exact: true })).toContainText('Rank: Equals 30');

  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  const rankChoice = page.getByRole('group', { name: 'Table columns' }).getByRole('checkbox', { name: 'Rank', exact: true });
  await rankChoice.uncheck();
  await rankChoice.check();
  await page.keyboard.press('Escape');
  await expect.poll(() => order(page)).toEqual(['name', 'rank', 'owned', ...equipmentOrder.slice(3)]);
  await dragColumn(page, 'Weapon', 'Owned', 'after');
  const moved = ['rank', 'owned', 'name', ...equipmentOrder.slice(3)];
  await expect.poll(() => order(page)).toEqual(moved);
  const cells = page.locator('tbody tr').first().getByRole('cell');
  await expect(cells.nth(0)).toHaveText('30');
  await expect(cells.nth(1).getByRole('checkbox', { name: 'Owned: Bo', exact: true })).toBeChecked();
  await expect(cells.nth(2).getByRole('button', { name: 'Edit Bo', exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(() => order(page)).toEqual(moved);
  await page.getByRole('link', { name: 'Warframes', exact: true }).click();
  await expect.poll(() => order(page)).toEqual(moved);
  await expect(page.locator('tbody tr').first().getByRole('cell').nth(0)).toHaveText('20');
  await dragColumn(page, 'Owned', 'Rank', 'before');
  const equipmentLayout = ['owned', 'rank', 'name', ...equipmentOrder.slice(3)];
  await page.getByRole('link', { name: 'Weapons', exact: true }).click();
  await expect.poll(() => order(page)).toEqual(equipmentLayout);

  await page.getByRole('link', { name: 'Relics', exact: true }).click();
  await dragColumn(page, 'Quantity', 'Relic', 'before');
  await expect.poll(() => order(page)).toEqual(['quantity', 'name', 'era', 'refinement', 'notes']);
  await expect(page.locator('tbody tr').first().getByRole('cell').nth(0)).toContainText('3');
  await header(page, 'Quantity').getByRole('button').press('Shift+F10');
  await expect(menu(page).getByRole('menuitem', { name: 'Move left' })).toBeDisabled();
  await menu(page).getByRole('menuitem', { name: 'Move right' }).click();
  await expect.poll(() => order(page)).toEqual(['name', 'quantity', 'era', 'refinement', 'notes']);
  await expect(header(page, 'Quantity').getByRole('button')).toBeFocused();
  await page.reload();
  await expect.poll(() => order(page)).toEqual(['name', 'quantity', 'era', 'refinement', 'notes']);
  await page.getByRole('link', { name: 'Weapons', exact: true }).click();
  await expect.poll(() => order(page)).toEqual(equipmentLayout);
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  await page.getByRole('button', { name: 'Reset to default' }).click();
  await page.keyboard.press('Escape');
  await expect.poll(() => order(page)).toEqual(equipmentOrder);
  await page.reload();
  await expect.poll(() => order(page)).toEqual(equipmentOrder);
  expect(JSON.stringify(await account.inventory())).toBe(saved);
});

test('column drags cancel cleanly and scroll to either end on a narrow screen', async ({ page, account }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/');
  const saved = JSON.stringify(await account.inventory());
  const grid = page.locator('.inventory-grid');
  const bounds = (await grid.boundingBox())!;
  const first = (await header(page, 'Weapon').boundingBox())!;
  const y = first.y + first.height / 2;
  const begin = async () => { await page.mouse.move(bounds.x + 80, y); await page.mouse.down(); await page.mouse.move(bounds.x + 110, y); };
  await begin();
  await expect(grid).toHaveAttribute('data-dragging', 'name');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(grid).not.toHaveAttribute('data-dragging');
  await expect(menu(page)).toHaveCount(0);
  await expect.poll(() => order(page)).toEqual(equipmentOrder);
  await begin();
  await page.mouse.move(bounds.x + 120, bounds.y + 180);
  await page.mouse.up();
  await expect.poll(() => order(page)).toEqual(equipmentOrder);
  await expect(menu(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('arsenal.inventory-columns'))).toBeNull();

  await begin();
  await page.mouse.move(bounds.x + bounds.width - 5, y);
  await expect.poll(() => grid.evaluate(element => element.scrollWidth - element.clientWidth - element.scrollLeft)).toBeLessThan(2);
  await page.mouse.up();
  await expect.poll(() => order(page)).toEqual([...equipmentOrder.slice(1), 'name']);
  await expect(menu(page)).toHaveCount(0);
  await page.screenshot({ path: 'test-results/reordered-columns-mobile.png' });
  await page.mouse.move(bounds.x + bounds.width - 60, y);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 5, y, { steps: 8 });
  await expect.poll(() => grid.evaluate(element => element.scrollLeft)).toBe(0);
  await page.mouse.up();
  await expect.poll(() => order(page)).toEqual(equipmentOrder);
  await header(page, 'Weapon').getByRole('button').click();
  await expect(menu(page)).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(JSON.stringify(await account.inventory())).toBe(saved);
});

test('selecting an active sort again clears only that column in every collection', async ({ page, account }) => {
  await page.goto('/');
  const saved = JSON.stringify(await account.inventory());
  for (const [tab, primary, column] of [['Weapons', 'Weapon', 'Rank'], ['Warframes', 'Equipment', 'Rank'], ['Relics', 'Relic', 'Quantity']]) {
    await page.getByRole('link', { name: tab, exact: true }).click();
    const first = header(page, primary).getByRole('button');
    const second = header(page, column).getByRole('button');
    if (tab !== 'Relics') { await first.click(); await menu(page).getByRole('menuitemradio', { name: 'Sort ascending' }).click(); }
    await second.click();
    await expect(menu(page).getByRole('menuitem', { name: 'Remove sort', exact: true })).toHaveCount(0);
    await menu(page).getByRole('menuitemradio', { name: 'Sort ascending' }).click();
    await expect(second).toHaveAccessibleDescription('Sort priority 2 of 2, ascending');
    await second.click();
    await expect(menu(page).getByRole('menuitemradio', { name: 'Sort ascending' })).toBeChecked();
    await menu(page).getByRole('menuitemradio', { name: 'Sort descending' }).click();
    await expect(second).toHaveAccessibleDescription('Sort priority 2 of 2, descending');
    await second.click();
    await menu(page).getByRole('menuitemradio', { name: 'Sort descending' }).click();
    await expect(second).toHaveAccessibleDescription('Unsorted');
    await expect(first).toHaveAccessibleDescription('Sort priority 1 of 1, ascending');
    await first.click();
    await menu(page).getByRole('menuitemradio', { name: 'Sort ascending' }).click();
    await expect(first).toHaveAccessibleDescription('Unsorted');
    await expect(page.locator('th[aria-sort]')).toHaveCount(0);
  }
  expect(JSON.stringify(await account.inventory())).toBe(saved);
});

test.describe('touch column dragging', () => {
  test.use({ hasTouch: true });
  test('dragging from header text keeps capture and does not open the menu on release', async ({ page, context, browserName, account }) => {
    test.skip(browserName !== 'chromium', 'Real touch dragging uses Chromium input events.');
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    await account.inventory();
    const source = (await header(page, 'Rank').getByRole('button').boundingBox())!;
    const target = (await header(page, 'Owned').boundingBox())!;
    const session = await context.newCDPSession(page);
    const y = source.y + source.height / 2;
    const startX = source.x + source.width / 2, endX = target.x + 8;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y }] });
    for (let step = 1; step <= 12; step++) {
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX + (endX - startX) * step / 12, y }] });
    }
    await expect(header(page, 'Rank')).toHaveAttribute('data-dragging', 'true');
    await expect(header(page, 'Owned')).toHaveAttribute('data-drop-edge', 'before');
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => order(page)).toEqual(['name', 'rank', 'owned', ...equipmentOrder.slice(3)]);
    await expect(menu(page)).toHaveCount(0);
    await header(page, 'Rank').getByRole('button').tap();
    await expect(menu(page)).toBeVisible();
    await session.detach();
  });
});

test('drag previews slide headers and cells, cancel without saving, and respect reduced motion', async ({ page, account }) => {
  await page.setViewportSize({ width: 1800, height: 900 });
  await page.goto('/');
  const saved = JSON.stringify(await account.inventory());
  await page.getByRole('textbox', { name: 'Search weapons' }).fill('Boltor');
  await page.evaluate(() => document.fonts.ready);
  const source = header(page, 'Rank'), neighbor = header(page, 'Owned');
  const sourceCell = page.locator('tbody tr').first().locator('[data-column-key="rank"]');
  const neighborCell = page.locator('tbody tr').first().locator('[data-column-key="owned"]');
  const from = (await source.boundingBox())!, to = (await neighbor.boundingBox())!;
  const y = from.y + from.height / 2, endX = to.x + 12;
  await page.evaluate(() => {
    const transitions: string[] = [];
    (window as Window & { columnTransitions: string[] }).columnTransitions = transitions;
    document.querySelector('.inventory-grid')!.addEventListener('transitionrun', event => {
      const cell = event.target as HTMLElement;
      if ((event as TransitionEvent).propertyName === 'transform' && cell.dataset.columnKey === 'owned') transitions.push(cell.tagName);
    });
  });
  const startDrag = async () => {
    await page.mouse.move(from.x + from.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(endX, y, { steps: 3 });
    await expect(source).toHaveAttribute('data-dragging', 'true');
  };
  await startDrag();
  await expect.poll(async () => (await neighbor.boundingBox())!.x).toBeCloseTo(to.x + from.width, 0);
  expect((await source.boundingBox())!.x).toBeCloseTo(endX - from.width / 2, 0);
  expect((await sourceCell.boundingBox())!.x).toBeCloseTo((await source.boundingBox())!.x, 0);
  expect((await neighborCell.boundingBox())!.x).toBeCloseTo((await neighbor.boundingBox())!.x, 0);
  const transitions = await page.evaluate(() => (window as Window & { columnTransitions: string[] }).columnTransitions);
  expect(transitions).toContain('TH');
  expect(transitions).toContain('TD');
  expect(await order(page)).toEqual(equipmentOrder);
  expect(await page.evaluate(() => localStorage.getItem('arsenal.inventory-columns'))).toBeNull();
  await page.screenshot({ path: 'test-results/column-slide-preview.png' });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect.poll(async () => (await source.boundingBox())!.x).toBeCloseTo(from.x, 0);
  await expect.poll(async () => (await neighbor.boundingBox())!.x).toBeCloseTo(to.x, 0);
  expect(await page.evaluate(() => localStorage.getItem('arsenal.inventory-columns'))).toBeNull();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startDrag();
  await expect.poll(async () => (await neighbor.boundingBox())!.x).toBeCloseTo(to.x + from.width, 0);
  expect(await neighbor.evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
  await page.mouse.up();
  await expect.poll(() => order(page)).toEqual(['name', 'rank', 'owned', ...equipmentOrder.slice(3)]);
  expect(await page.locator('.inventory-grid').evaluate(element => element.getAnimations({ subtree: true }).some(animation => animation.playState === 'running'))).toBe(false);
  expect(JSON.stringify(await account.inventory())).toBe(saved);
});
