import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { test, expect } from './accountFixture';
import { createEquipment } from '../../src/lib/model';
import { createRelic } from '../../src/lib/relics';
import { parseMarketHistory, parseMarketItems, parseMarketOrders } from '../../src/lib/market';
import { wfmHistory, wfmItems, wfmOrders } from '../fixtures/wfm';
import { expectCenteredTable } from './tableLayout';

async function mockMarket(page: Page, options: { stale?: boolean; unavailable?: boolean; noSellers?: boolean; historyUnavailable?: boolean } = {}) {
  const requests: string[] = [];
  await page.route('**/api/wfm/**', async route => {
    const url = new URL(route.request().url()); requests.push(url.pathname + url.search);
    if (options.unavailable || options.historyUnavailable && url.pathname.includes('/history/')) {
      await route.fulfill({ status: 503, headers: { 'Retry-After': '60' }, json: { error: 'WFM is temporarily unavailable.' } }); return;
    }
    const multiplier = (url.searchParams.get('platform') === 'switch' ? 2 : 1) * (url.pathname.includes('secura') ? 2 : 1);
    const relic = url.pathname.includes('relic');
    const intact = wfmHistory(relic ? 'intact' : undefined, multiplier), radiant = wfmHistory('radiant', 10 * multiplier);
    const history = parseMarketHistory(intact);
    if (relic) { const extra = parseMarketHistory(radiant); history['90days'].push(...extra['90days']); history['48hours'].push(...extra['48hours']); }
    const rawOrders = wfmOrders(relic ? 'intact' : undefined, multiplier);
    if (relic) rawOrders.data.push(...wfmOrders('radiant', 10 * multiplier).data);
    const orders = parseMarketOrders(rawOrders).filter(order => !options.noSellers || order.type !== 'sell' || order.status === 'offline');
    await route.fulfill({ json: {
      data: url.pathname.endsWith('/items') ? parseMarketItems(wfmItems) : url.pathname.includes('/history/') ? history : orders,
      fetchedAt: new Date(Date.now() - (options.stale ? 600_000 : 0)).toISOString(), stale: options.stale ?? false,
      ...(options.stale ? { error: 'WFM rate limit reached.', retryAt: new Date(Date.now() + 60_000).toISOString() } : {}),
    } });
  });
  return requests;
}

test.beforeEach(async ({ account }) => {
  const inventory = (await account.session()).profile.inventory;
  inventory.items = [createEquipment({ name: 'Braton Prime', slot: 'Primary', variant: 'Prime' }), createEquipment({ name: 'Ash Prime', slot: 'Warframe', variant: 'Prime' })];
  inventory.relics = ['Intact', 'Radiant'].map(refinement => ({ ...createRelic(), name: 'Lith A13', refinement: refinement as 'Intact' | 'Radiant', quantity: 1 }));
  await account.setInventory(inventory);
});

test('WFM estimates have rich tooltips; the explorer shares exact data, keyboard inspection and CSV without changing inventory', async ({ page, account }) => {
  const requests = await mockMarket(page);
  await page.goto('/warframes');
  const before = await account.inventory();
  const price = page.getByRole('button', { name: /^WFM: Ash Prime:/ });
  await expect(price).toHaveText('14 platinumset');
  await price.hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toContainText('5 / 5');
  await expect(tooltip).toContainText('10 platinum / 14 platinum / 999 platinum');
  await expect(tooltip).toContainText('Offline listings excluded2');
  await expect(tooltip).toContainText('Price of the tradeable component set, not built equipment.');
  expect(requests.filter(url => url.includes('/history/'))).toHaveLength(0);
  await price.click();
  const modal = page.getByRole('dialog', { name: 'Ash Prime Set · WFM', exact: true });
  await expect(modal).toBeVisible();
  await expect(modal.getByRole('combobox', { name: 'WFM market' })).toBeFocused();
  const plot = modal.getByRole('group', { name: 'Explore WFM price history', exact: true });
  await expect(modal.getByRole('img', { name: 'Price history in platinum, 90 timestamps' })).toBeVisible();
  await plot.click({ position: { x: 150, y: 150 } });
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await plot.focus(); await plot.press('End'); await plot.press('Enter');
  await expect(modal.getByRole('button', { name: 'Unpin sample' })).toBeVisible();
  await expect(modal.locator('.market-chart-tip time')).toHaveAttribute('datetime', '2026-10-13T00:00:00.000Z');
  await modal.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(modal.getByRole('img')).toHaveAttribute('aria-label', 'Price history in platinum, 46 timestamps');
  await modal.getByRole('button', { name: 'Reset view', exact: true }).click();
  await modal.getByRole('checkbox', { name: 'Sell median', exact: true }).uncheck();
  await modal.getByRole('checkbox', { name: 'Buy median', exact: true }).uncheck();
  await expect(modal.getByRole('checkbox', { name: 'Closed median', exact: true })).toBeDisabled();
  await modal.getByRole('checkbox', { name: 'Target line', exact: true }).check();
  await expect(modal.getByRole('alert')).toHaveText('Enter a target from 0 to 1,000,000 platinum');
  await modal.getByRole('spinbutton', { name: 'Target platinum' }).fill('20');
  await expect(modal.locator('.market-target')).toHaveCount(1);
  await modal.getByRole('tab', { name: 'Chart', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  const table = modal.getByRole('region', { name: 'Exact WFM price history', exact: true });
  await expect(table.locator('tbody tr')).toHaveCount(90);
  await expectCenteredTable(table);
  await expect(table.locator('tbody tr').nth(10).locator('td').nth(1)).toHaveText('—');
  await modal.getByRole('button', { name: 'Sort Time (UTC)', exact: true }).click();
  await modal.getByRole('button', { name: 'Sort Time (UTC)', exact: true }).click();
  await expect(table.locator('tbody tr').first().locator('time')).toHaveAttribute('datetime', '2026-10-13T00:00:00.000Z');
  const download = page.waitForEvent('download');
  await modal.getByRole('button', { name: 'Export range CSV', exact: true }).click();
  const csv = await readFile((await (await download).path())!, 'utf8');
  expect(csv.trim().split('\n')).toHaveLength(91);
  expect(csv.split('\n')[1]).toContain('2026-10-13T00:00:00.000Z');
  expect(csv.split('\n').find(row => row.startsWith('"2026-07-26'))).toContain(',"",""');
  await modal.getByRole('button', { name: '48 hours', exact: true }).click();
  await expect(table.locator('tbody tr')).toHaveCount(48);
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0); await expect(price).toBeFocused();
  expect(await account.inventory()).toEqual(before);
  expect(requests.filter(url => url.includes('/history/'))).toHaveLength(1);
});

test('relic refinements share requests but keep distinct prices and history; market selection is separate from inventory', async ({ page, account }) => {
  const requests = await mockMarket(page);
  await page.goto('/relics');
  const before = await account.inventory();
  await expect(page.getByRole('button', { name: /^WFM: Lith A13 Intact:/ })).toHaveText('14 platinum');
  const radiant = page.getByRole('button', { name: /^WFM: Lith A13 Radiant:/ });
  await expect(radiant).toHaveText('140 platinum');
  expect(requests.filter(url => url.includes('/orders/'))).toHaveLength(1);
  await radiant.click();
  const modal = page.getByRole('dialog', { name: 'Lith A13 Relic · WFM', exact: true });
  await expect(modal.getByRole('combobox', { name: 'WFM item type' })).toHaveText('Radiant');
  await expect(modal.getByRole('img', { name: 'Price history in platinum, 90 timestamps' })).toBeVisible();
  const download = page.waitForEvent('download');
  await modal.getByRole('button', { name: 'Export range CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toContain('-pc-subtype-radiant-90days-');
  await modal.getByRole('combobox', { name: 'WFM item type' }).click();
  await page.getByRole('option', { name: 'Flawless', exact: true }).click();
  await expect(modal).toContainText('No matching online sellers. No current estimate.');
  await expect(modal).toContainText('No history for this exact variant and time range.');
  await modal.getByRole('combobox', { name: 'WFM item type' }).click();
  await page.getByRole('option', { name: 'Intact', exact: true }).click();
  await modal.getByRole('combobox', { name: 'WFM market' }).click();
  await page.getByRole('option', { name: 'Switch', exact: true }).click();
  await expect(modal.locator('.market-metrics dd').first()).toHaveText('28 platinum');
  await page.keyboard.press('Escape');
  await expect(radiant).toHaveText('280 platinum');
  expect(await account.inventory()).toEqual(before);
  expect(requests.filter(url => url.includes('/orders/') && url.endsWith('platform=switch'))).toHaveLength(1);
});

test('stale prices are marked, failures remain unavailable, and a missing history does not hide live orders', async ({ page }) => {
  await mockMarket(page, { stale: true, historyUnavailable: true });
  await page.goto('/');
  const price = page.getByRole('button', { name: /^WFM: Braton Prime:/ });
  await expect(price).toContainText('14 platinum'); await expect(price).toContainText('stale');
  await price.click();
  const modal = page.getByRole('dialog', { name: 'Braton Prime Set · WFM', exact: true });
  await expect(modal).toContainText('Stale prices: WFM rate limit reached.');
  await expect(modal).toContainText('History unavailable: WFM is temporarily unavailable.');
  await expect(modal.locator('.market-metrics dd').first()).toHaveText('14 platinum');
  await page.keyboard.press('Escape');
  await page.unroute('**/api/wfm/**'); await mockMarket(page, { unavailable: true });
  await page.reload();
  await expect(page.getByRole('button', { name: 'WFM: Braton Prime', exact: true })).toHaveText('Unavailable');
  await expect(page.locator('.inventory-table .equipment-label')).toHaveText(['Braton Prime']);
});

test('stale cached SQL data renders upfront and updates in place once the background refresh completes', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/wfm/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/items')) {
      await route.fulfill({ json: { data: parseMarketItems(wfmItems), fetchedAt: new Date().toISOString(), stale: false } });
      return;
    }
    calls++;
    const fresh = calls > 1;
    await route.fulfill({
      json: {
        data: parseMarketOrders(wfmOrders(undefined, fresh ? 2 : 1)),
        fetchedAt: new Date(Date.now() - (fresh ? 0 : 600_000)).toISOString(),
        stale: !fresh,
        ...(fresh ? {} : { refreshing: true, retryAt: new Date(Date.now() + 300).toISOString() }),
      },
    });
  });
  await page.goto('/');
  const price = page.getByRole('button', { name: /^WFM: Braton Prime:/ });
  await expect(price).toContainText('14 platinum');
  await expect(price).toContainText('stale');
  await expect(price.locator('.market-spinner.is-inline')).toBeVisible();
  await expect(price).toHaveText('28 platinumset');
  await expect(price.locator('.market-spinner')).toHaveCount(0);
});

test('mobile price tooltip, modal, chart and exact data stay within the viewport in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mockMarket(page);
  await page.goto('/');
  await expect(page.locator('.inventory-table .equipment-label')).toHaveText(['Braton Prime']);
  const price = page.getByRole('button', { name: /^WFM: Braton Prime(?::|$)/ });
  await price.scrollIntoViewIfNeeded();
  await expect(price).toHaveText('14 platinumset');
  await price.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  const bounds = await page.getByRole('tooltip').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375);
  await price.click();
  const modal = page.getByRole('dialog', { name: 'Braton Prime Set · WFM', exact: true });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    await modal.getByRole('group', { name: 'Explore WFM price history', exact: true }).scrollIntoViewIfNeeded();
    const chartBounds = await modal.locator('.market-chart-frame').boundingBox();
    expect(chartBounds!.height).toBe(240); expect(chartBounds!.x + chartBounds!.width).toBeLessThanOrEqual(375);
    await modal.getByRole('group', { name: 'Explore WFM price history', exact: true }).press('End');
    const tip = await modal.locator('.market-chart-tip').boundingBox();
    expect(tip!.x).toBeGreaterThanOrEqual(0); expect(tip!.x + tip!.width).toBeLessThanOrEqual(375);
    await page.screenshot({ path: `test-results/wfm-mobile-${theme}.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const overflow = await modal.locator('.market-dialog-body').evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth, offenders: [...element.querySelectorAll('*')].filter(child => child.getBoundingClientRect().width > 0 && child.getBoundingClientRect().right > element.getBoundingClientRect().right).map(child => `${child.tagName}.${child.className}`).slice(0, 12) }));
    expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width);
  }
  await modal.getByRole('tab', { name: 'Exact data', exact: true }).click();
  await expect(modal.getByRole('region', { name: 'Exact WFM price history' }).locator('tbody tr')).toHaveCount(90);
  expect(await modal.locator('.market-dialog-body').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await modal.getByRole('button', { name: 'Close', exact: true }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(modal.getByRole('link', { name: 'Open on Warframe Market' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(price).toBeFocused();
});

test('WFM sorting resolves offscreen prices and supports fractional filters without modifying inventory', async ({ page, account }) => {
  const inventory = (await account.session()).profile.inventory;
  inventory.items.push(...Array.from({ length: 30 }, (_, index) => createEquipment({ name: `Custom weapon ${index}`, slot: 'Primary', variant: 'Base' })));
  inventory.items.push(createEquipment({ name: 'Secura Dual Cestra', slot: 'Secondary', variant: 'Secura' }));
  await account.setInventory(inventory);
  const requests = await mockMarket(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^WFM: Braton Prime:/ })).toHaveText('14 platinumset');
  expect(requests.some(url => url.includes('secura'))).toBe(false);
  const header = page.getByRole('button', { name: 'WFM column options', exact: true });
  await header.click(); await page.getByRole('menuitemradio', { name: 'Sort descending', exact: true }).click();
  await expect(page.locator('.inventory-table .equipment-label').first()).toHaveText('Secura Dual Cestra');
  await expect(page.getByRole('button', { name: /^WFM: Secura Dual Cestra:/ })).toHaveText('28 platinum');
  await header.click(); await page.getByRole('combobox', { name: 'WFM condition' }).click();
  await page.getByRole('option', { name: 'At least', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Filter wfm', exact: true }).fill('14.5');
  await expect(page.locator('.inventory-table .equipment-label')).toHaveText(['Secura Dual Cestra']);
  expect(await account.inventory()).toEqual(inventory);
});

test('reward prices open above relic details and restore focus without closing the underlying dialog', async ({ page }) => {
  await mockMarket(page); await page.goto('/relics');
  await page.getByRole('button', { name: 'Edit Lith A13 Intact', exact: true }).click();
  const details = page.getByRole('dialog');
  const price = details.getByRole('button', { name: /^WFM: Paris Prime Lower Limb:/ });
  await expect(price).toHaveText('14 platinum');
  await price.focus(); await expect(details.getByRole('tooltip')).toContainText('Platinum per item');
  await price.click();
  const market = page.getByRole('dialog', { name: 'Paris Prime Lower Limb · WFM', exact: true });
  await expect(market).toBeVisible();
  await market.getByRole('group', { name: 'Explore WFM price history', exact: true }).click();
  await expect(market.getByRole('button', { name: 'Unpin sample' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(market).toHaveCount(0);
  await expect(price).toBeFocused();
  await expect(page.getByRole('button', { name: 'Close details', exact: true })).toBeVisible();
  await price.click(); await expect(market).toBeVisible();
  await page.evaluate(() => { location.hash = '#weapons'; });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test.describe('touch price history', () => {
  test.use({ hasTouch: true });
  test('tabs follow a swipe, keep previews inert, and leave chart and table gestures alone', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockMarket(page); await page.goto('/relics');
    await expect(page.locator('.inventory-table .equipment-label')).toHaveCount(2);
    const price = page.getByRole('button', { name: /^WFM: Lith A13 Radiant(?::|$)/ });
    await price.scrollIntoViewIfNeeded(); await expect(price).toHaveText('140 platinum'); await price.tap();
    const modal = page.getByRole('dialog', { name: 'Lith A13 Relic · WFM', exact: true });
    const chartTab = modal.getByRole('tab', { name: 'Chart', exact: true }), dataTab = modal.getByRole('tab', { name: 'Exact data', exact: true });
    await chartTab.scrollIntoViewIfNeeded();
    const session = await context.newCDPSession(page);
    const swipe = async (delta: number, preview = false, cancel = false) => {
      const rect = (await modal.locator('.market-tabs').boundingBox())!, x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let step = 1; step <= 8; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + delta * step / 8, y }] });
      if (preview) {
        await expect(modal.locator('.is-swipe-preview')).toHaveAttribute('inert', '');
        await expect(modal.locator('.is-swipe-preview')).toHaveAttribute('aria-hidden', 'true');
        expect(await modal.locator('.market-tab-viewport').evaluate(element => element.scrollWidth <= element.clientWidth || getComputedStyle(element).overflowX === 'clip')).toBe(true);
      }
      await session.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
      await expect(modal.locator('.is-sliding')).toHaveCount(0);
    };
    await swipe(-24, true); await expect(chartTab).toHaveAttribute('aria-selected', 'true');
    await swipe(-90, true); await expect(dataTab).toHaveAttribute('aria-selected', 'true');
    await expect(modal.locator('.is-swipe-preview')).toHaveCount(0);
    await expect(modal.getByRole('tabpanel')).toHaveCount(1);
    const table = modal.getByRole('region', { name: 'Exact WFM price history', exact: true });
    await expectCenteredTable(table);
    await table.scrollIntoViewIfNeeded();
    const bounds = (await table.boundingBox())!, x = bounds.x + 220, y = bounds.y + 80;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - step * 15, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    await expect(dataTab).toHaveAttribute('aria-selected', 'true');
    await dataTab.scrollIntoViewIfNeeded();
    await swipe(90, true, true); await expect(dataTab).toHaveAttribute('aria-selected', 'true');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await swipe(90, true); await expect(chartTab).toHaveAttribute('aria-selected', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await session.detach();
  });
});
