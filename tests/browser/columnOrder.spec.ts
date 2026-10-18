import { test, expect } from './accountFixture';
import type { Page } from '@playwright/test';
import { createEquipment } from '../../src/lib/model';
import { createRelic } from '../../src/lib/relics';

const header = (page: Page, name: string) => page.getByRole('columnheader').filter({ has: page.getByRole('button', { name: `${name} column options`, exact: true }) });
const order = (page: Page) => page.locator('.inventory-section .inventory-table th').evaluateAll(cells => cells.map(cell => (cell as HTMLElement).dataset.columnKey));
const menu = (page: Page) => page.getByRole('group', { name: /Column actions for/ });
const equipmentOrder = ['name', 'wfm', 'owned', 'rank', 'mastered', 'incarnon', 'upgraded', 'keep', 'craftingTarget'];

async function dragColumn(page: Page, source: string, target: string, edge: 'before' | 'after') {
  await expect(page.locator('.column-drag-layer')).toHaveCount(0);
  const from = (await header(page, source).boundingBox())!;
  const sourceKey = await header(page, source).getAttribute('data-column-key');
  const targetKey = await header(page, target).getAttribute('data-column-key');
  const geometry = await page.locator('.inventory-section th').evaluateAll(cells => cells.map(cell => ({ key: (cell as HTMLElement).dataset.columnKey, width: cell.getBoundingClientRect().width })));
  const remaining = geometry.filter(column => column.key !== sourceKey);
  const index = remaining.findIndex(column => column.key === targetKey) + (edge === 'after' ? 1 : 0);
  const tableLeft = (await page.locator('.inventory-section table').boundingBox())!.x;
  const x = tableLeft + remaining.slice(0, index).reduce((sum, column) => sum + column.width, 0) + from.width / 2;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, from.y + from.height / 2, { steps: 12 });
  await expect(header(page, source)).toHaveAttribute('data-dragging', 'true');
  await expect(header(page, target)).toHaveAttribute('data-drop-edge', edge);
  await page.mouse.up();
  await expect(menu(page)).toHaveCount(0);
  await expect(page.locator('.column-drag-layer')).toHaveCount(0);
}

test('dragged columns keep their data, filters, and independent saved order in each collection', async ({ page, account }) => {
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
  await page.getByRole('spinbutton', { name: 'Filter rank' }).fill('30');
  await page.keyboard.press('Escape');
  await dragColumn(page, 'Rank', 'Owned', 'before');
  await expect.poll(() => order(page)).toEqual(['name', 'wfm', 'rank', 'owned', ...equipmentOrder.slice(4)]);
  await expect(page.getByRole('button', { name: 'Rank column options' })).toHaveAccessibleDescription('Sort priority 1 of 1, descending');
  await expect(page.locator('.inventory-table .equipment-label')).toHaveText(['Bo']);
  await expect(page.locator('tbody tr').first().locator('[data-column-key="rank"]')).toHaveText('30');
  await expect(page.getByRole('group', { name: 'Column filters', exact: true })).toContainText('Rank: Equals 30');

  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  const rankChoice = page.getByRole('group', { name: 'Table columns' }).getByRole('checkbox', { name: 'Rank', exact: true });
  await rankChoice.uncheck();
  await rankChoice.check();
  await page.keyboard.press('Escape');
  await expect.poll(() => order(page)).toEqual(['name', 'wfm', 'rank', 'owned', ...equipmentOrder.slice(4)]);
  await dragColumn(page, 'Weapon', 'Owned', 'after');
  const moved = ['wfm', 'rank', 'owned', 'name', ...equipmentOrder.slice(4)];
  await expect.poll(() => order(page)).toEqual(moved);
  const cells = page.locator('tbody tr').first().getByRole('cell');
  await expect(cells.nth(1)).toHaveText('30');
  await expect(cells.nth(2).getByRole('checkbox', { name: 'Owned: Bo', exact: true })).toBeChecked();
  await expect(cells.nth(3).getByRole('button', { name: 'Edit Bo', exact: true })).toBeVisible();
  await page.reload();
  await expect.poll(() => order(page)).toEqual(moved);
  await page.getByRole('link', { name: 'Warframes', exact: true }).click();
  const warframeMoved = moved.filter(key => !['incarnon', 'craftingTarget'].includes(key));
  await expect.poll(() => order(page)).toEqual(warframeMoved);
  await expect(page.locator('tbody tr').first().locator('[data-column-key="rank"]')).toHaveText('20');
  await dragColumn(page, 'Owned', 'Rank', 'before');
  const warframeLayout = ['wfm', 'owned', 'rank', ...warframeMoved.slice(3)];
  await expect.poll(() => order(page)).toEqual(warframeLayout);
  await page.getByRole('link', { name: 'Weapons', exact: true }).click();
  await expect.poll(() => order(page)).toEqual(moved);

  await page.getByRole('link', { name: 'Relics', exact: true }).click();
  await dragColumn(page, 'Quantity', 'Relic', 'before');
  await expect.poll(() => order(page)).toEqual(['quantity', 'name', 'wfm', 'era', 'refinement', 'notes']);
  await expect(page.locator('tbody tr').first().getByRole('cell').nth(0)).toContainText('3');
  await header(page, 'Quantity').getByRole('button').press('Shift+F10');
  await expect(menu(page).getByRole('menuitem', { name: 'Move left' })).toBeDisabled();
  await menu(page).getByRole('menuitem', { name: 'Move right' }).click();
  await expect.poll(() => order(page)).toEqual(['name', 'quantity', 'wfm', 'era', 'refinement', 'notes']);
  await expect(header(page, 'Quantity').getByRole('button')).toBeFocused();
  await page.reload();
  await expect.poll(() => order(page)).toEqual(['name', 'quantity', 'wfm', 'era', 'refinement', 'notes']);
  await page.getByRole('link', { name: 'Warframes', exact: true }).click();
  await expect.poll(() => order(page)).toEqual(warframeLayout);
  await page.getByRole('link', { name: 'Weapons', exact: true }).click();
  await expect.poll(() => order(page)).toEqual(moved);
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
  const grid = page.locator('.inventory-section .inventory-grid');
  const bounds = (await grid.boundingBox())!;
  const first = (await header(page, 'Weapon').boundingBox())!;
  const y = first.y + first.height / 2;
  const begin = async () => { await expect(page.locator('.column-drag-layer')).toHaveCount(0); await page.mouse.move(bounds.x + 80, y); await page.mouse.down(); await page.mouse.move(bounds.x + 110, y); };
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
  await expect(page.locator('.column-drag-layer')).toHaveCount(0);
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
  for (const [tab, primary, column] of [['Weapons', 'Weapon', 'Rank'], ['Warframes', 'Warframe', 'Rank'], ['Relics', 'Relic', 'Quantity']]) {
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

test('drag previews preserve cell geometry and never scroll away from a stationary pointer', async ({ page, account }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/');
  const saved = JSON.stringify(await account.inventory());
  const grid = page.locator('.inventory-section .inventory-grid');
  await grid.evaluate(element => { element.scrollLeft = 350; });
  const extent = await grid.evaluate(element => element.scrollWidth);
  const from = (await header(page, 'Weapon').boundingBox())!;
  const x = from.x + 100, y = from.y + from.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 20, y);
  const layer = page.locator('.column-drag-layer');
  await expect(layer).toHaveAttribute('aria-hidden', 'true');
  expect(await layer.evaluate(element => element.inert)).toBe(true);
  const positions = await grid.evaluate(async element => {
    const samples = [];
    for (let frame = 0; frame < 15; frame++) {
      await new Promise(requestAnimationFrame);
      samples.push({ scroll: element.scrollLeft, extent: element.scrollWidth, target: element.querySelector('[data-drop-edge]')?.getAttribute('data-column-key') ?? null });
    }
    return samples;
  });
  expect(positions.every(sample => sample.scroll === 350 && sample.extent === extent && sample.target === null)).toBe(true);
  const geometry = await layer.evaluate(element => [...element.querySelectorAll<HTMLElement>('.column-drag-preview')].map(group => {
    const real = document.querySelector<HTMLTableElement>('.inventory-section table')!;
    const index = [...real.tHead!.rows[0].cells].findIndex(cell => cell.dataset.columnKey === group.dataset.columnKey);
    const source = real.tHead!.rows[0].cells[index].getBoundingClientRect();
    const heading = group.querySelector('th')!.getBoundingClientRect();
    return {
      widthError: Math.abs(heading.width - source.width), topError: Math.abs(heading.top - source.top),
      rows: [...group.querySelectorAll('td')].map((cell, row) => {
        const original = real.tBodies[0].rows[row].cells[index], bounds = cell.getBoundingClientRect(), originalBounds = original.getBoundingClientRect();
        return { topError: Math.abs(bounds.top - originalBounds.top), heightError: Math.abs(bounds.height - originalBounds.height), widthError: Math.abs(bounds.width - source.width), contentMatches: cell.textContent === original.textContent };
      }),
      total: real.tBodies[0].rows.length,
    };
  }));
  for (const column of geometry) {
    expect(column.widthError).toBeLessThan(1);
    expect(column.topError).toBeLessThan(1);
    expect(column.rows.length).toBeLessThan(column.total);
    expect(column.rows.every(row => row.topError < 1 && row.heightError < 1 && row.widthError < 1 && row.contentMatches)).toBe(true);
  }
  for (const distance of [80, 400, 220, 80, 20, 556]) {
    await page.mouse.move(x + distance, y);
    expect((await page.locator('.column-drag-preview[data-lifted]').boundingBox())!.x).toBeCloseTo(from.x + distance, 0);
    expect(await grid.evaluate(element => element.scrollLeft)).toBe(350);
  }
  expect(await page.evaluate(() => localStorage.getItem('arsenal.inventory-columns'))).toBeNull();
  await expect(header(page, 'Recommended action')).toHaveAttribute('data-drop-edge', 'after');
  await page.mouse.up();
  await expect(layer).toHaveCount(0);
  expect(await grid.evaluate(element => element.scrollLeft)).toBe(350);
  await expect.poll(() => order(page)).toEqual([...equipmentOrder.slice(1, 8), 'name', 'craftingTarget']);
  expect(JSON.stringify(await account.inventory())).toBe(saved);
});

test('neighbor columns slide smoothly, reverse on cancellation, and honor reduced motion', async ({ page, account }) => {
  await page.setViewportSize({ width: 1800, height: 900 });
  await page.goto('/');
  const saved = JSON.stringify(await account.inventory());
  const from = (await header(page, 'Weapon').boundingBox())!;
  const neighborBounds = (await header(page, 'WFM').boundingBox())!;
  const x = from.x + 100, y = from.y + from.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 20, y);
  const neighbor = page.locator('.column-drag-preview[data-column-key="wfm"]');
  const samples = neighbor.evaluate(async element => {
    const positions: number[] = [], start = performance.now();
    while (performance.now() - start < 250) {
      positions.push(element.getBoundingClientRect().left);
      await new Promise(requestAnimationFrame);
    }
    return positions;
  });
  await page.mouse.move(x + neighborBounds.width + 10, y);
  expect((await samples).some(left => left > from.x + 2 && left < neighborBounds.x - 2)).toBe(true);
  await expect.poll(async () => (await neighbor.boundingBox())!.x).toBeCloseTo(from.x, 0);
  await page.mouse.move(x + 20, y);
  await expect.poll(async () => (await neighbor.boundingBox())!.x).toBeCloseTo(neighborBounds.x, 0);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.locator('.column-drag-layer')).toHaveCount(0);
  await expect.poll(() => order(page)).toEqual(equipmentOrder);
  expect(await page.evaluate(() => localStorage.getItem('arsenal.inventory-columns'))).toBeNull();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + neighborBounds.width + 10, y);
  expect(await neighbor.evaluate(element => getComputedStyle(element).transitionDuration)).toBe('0s');
  expect((await neighbor.boundingBox())!.x).toBeCloseTo(from.x, 0);
  await page.mouse.up();
  await expect(page.locator('.column-drag-layer')).toHaveCount(0);
  await expect.poll(() => order(page)).toEqual(['wfm', 'name', ...equipmentOrder.slice(2)]);
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
    await expect.poll(() => order(page)).toEqual(['name', 'wfm', 'rank', 'owned', ...equipmentOrder.slice(4)]);
    await expect(menu(page)).toHaveCount(0);
    await expect(page.locator('.column-drag-layer')).toHaveCount(0);
    // Chromium can suppress a tap's click just after a drag (crbug.com/1141207).
    // Separate the gestures before checking that our drag-click suppression resets.
    await page.waitForTimeout(500);
    await expect(menu(page)).toHaveCount(0);
    await header(page, 'Rank').getByRole('button').tap();
    await expect(menu(page)).toBeVisible();
    await session.detach();
  });
});
