import type { Page } from '@playwright/test';
import { test, expect } from './accountFixture';
import { createRelic } from '../../src/lib/relics';
import example from '../fixtures/relic-screenshot.json' with { type: 'json' };

const synthetic = [
  { name: 'Axi A21', refinement: 'Intact', quantity: 3 },
  { name: 'Axi C12', refinement: 'Intact', quantity: 2 },
  { name: 'Lith A13', refinement: 'Radiant', quantity: 4 },
  { name: 'Lith A13', refinement: 'Intact', quantity: 1 },
  { name: 'Lith G14', refinement: 'Radiant', quantity: 6 },
  { name: 'Lith L8', refinement: 'Intact', quantity: 12 },
];

async function screenshot(page: Page) {
  const base64 = await page.evaluate(stacks => {
    const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = 760;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#101418'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#e0c878'; ctx.font = '24px Arial';
    stacks.forEach((stack, index) => {
      const center = 180 + index % 3 * 300, bottom = 300 + Math.floor(index / 3) * 340;
      ctx.textAlign = 'center'; ctx.fillText(`${stack.name} Relic`, center, bottom - (stack.refinement === 'Intact' ? 0 : 32));
      if (stack.refinement !== 'Intact') ctx.fillText(`[${stack.refinement}]`, center, bottom);
      ctx.textAlign = 'left'; if (stack.quantity > 1) ctx.fillText(`x${stack.quantity}`, center - 105, bottom - 200);
    });
    return canvas.toDataURL('image/png').split(',')[1];
  }, synthetic);
  return { name: 'relic-grid.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

async function review(page: Page, stacks: typeof synthetic) {
  await expect(page.getByRole('button', { name: 'Cancel reading', exact: true })).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Review relics', exact: true })).toBeVisible();
  await expect(page.locator('.relic-review-table tbody tr')).toHaveCount(stacks.length);
  for (const stack of stacks) {
    const label = `${stack.name} ${stack.refinement}`;
    await expect(page.getByRole('spinbutton', { name: `Quantity: ${label}`, exact: true })).toHaveValue(String(stack.quantity));
    await expect(page.getByRole('combobox', { name: `Refinement: ${label}`, exact: true })).toHaveText(stack.refinement);
  }
}

test('relic screenshot review merges overlaps, keeps edits and imports only selected quantities', async ({ page, account }) => {
  await page.goto('/#relics');
  const original = await account.inventory();
  original.relics = [{ ...createRelic(), name: 'Axi A21', quantity: 9, notes: 'Keep this plan' }, { ...createRelic(), name: 'Neo N1', quantity: 8, notes: 'Absent from capture' }];
  await account.setInventory(original); await page.reload();
  await page.getByRole('button', { name: 'Import screenshots', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Relics', exact: true })).toBeVisible();
  const image = await screenshot(page);
  const input = page.getByLabel('Choose relics screenshots', { exact: true });
  await input.setInputFiles(image);
  await review(page, synthetic);
  await expect(page.getByRole('checkbox', { name: 'Import Lith A13 Intact', exact: true })).not.toBeChecked();
  expect(await account.inventory()).toEqual(original);
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Quantity: Lith A13 Radiant', exact: true }).fill('7');
  await page.getByRole('checkbox', { name: 'Import Axi C12 Intact', exact: true }).uncheck();
  await input.setInputFiles(image);
  await review(page, synthetic.map(stack => stack.refinement === 'Radiant' && stack.name === 'Lith A13' ? { ...stack, quantity: 7 } : stack));
  await expect(page.getByRole('checkbox', { name: 'Import Axi C12 Intact', exact: true })).not.toBeChecked();
  const quantity = page.getByRole('spinbutton', { name: 'Quantity: Lith A13 Radiant', exact: true });
  await quantity.fill('-1');
  await expect(page.getByRole('button', { name: 'Import 5 stacks', exact: true })).toBeDisabled();
  await quantity.fill('7');
  await page.getByRole('button', { name: 'Import 5 stacks', exact: true }).click();
  await expect(page).toHaveURL(/#relics$/);
  const saved = await account.inventory();
  expect(saved.items).toEqual(original.items);
  expect(saved.relics).toHaveLength(6);
  expect(saved.relics.find(item => item.id === original.relics[0].id)).toMatchObject({ quantity: 3, notes: 'Keep this plan' });
  expect(saved.relics.find(item => item.id === original.relics[1].id)).toEqual(original.relics[1]);
  expect(saved.relics.find(item => item.name === 'Axi C12')).toBeUndefined();
  expect(saved.relics.find(item => item.name === 'Lith A13' && item.refinement === 'Radiant')?.quantity).toBe(7);
  await page.reload();
  await expect(page.getByLabel('Lith A13 Radiant quantity', { exact: true })).toHaveText('7');
});

test('relic screenshot instructions, type switching and review fit narrow screens', async ({ page, account }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/#import');
  const before = await account.inventory();
  await page.getByRole('group', { name: 'Screenshot type' }).getByRole('button', { name: 'Relics', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Inventory', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Relics instructions', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Relic screenshots' })).toContainText('Void Relics / Refinement');
  await page.keyboard.press('Escape');
  await page.getByLabel('Choose relics screenshots', { exact: true }).setInputFiles(await screenshot(page));
  await review(page, synthetic);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/relic-screenshot-review-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('group', { name: 'Screenshot type' }).getByRole('button', { name: 'Equipment', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Inventory', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Codex', exact: true })).toBeVisible();
  expect(await account.inventory()).toEqual(before);
});

test.describe('guest relic screenshot imports', () => {
  test.use({ signedIn: false });
  test('pasted screenshots stay local, require review and create temporary stacks', async ({ page }) => {
    const writes: string[] = [], external: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/account/') && request.method() !== 'GET') writes.push(request.url());
      if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:5173')) external.push(request.url());
    });
    await page.goto('/#relics');
    await expect(page.getByRole('button', { name: 'Import screenshots', exact: true })).toBeVisible();
    await page.keyboard.press('Alt+i');
    await expect(page).toHaveURL(/#import$/);
    const image = await screenshot(page);
    await page.getByRole('region', { name: 'Relics', exact: true }).getByRole('button', { name: /Drag and drop/ }).focus();
    await page.evaluate(base64 => {
      const transfer = new DataTransfer(); transfer.items.add(new File([Uint8Array.from(atob(base64), char => char.charCodeAt(0))], 'pasted-relics.png', { type: 'image/png' }));
      const event = new Event('paste', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'clipboardData', { value: transfer }); document.dispatchEvent(event);
    }, image.buffer.toString('base64'));
    await review(page, synthetic);
    await page.getByRole('button', { name: 'Select all', exact: true }).click();
    await page.getByRole('button', { name: 'Import 6 stacks', exact: true }).click();
    await expect(page).toHaveURL(/#relics$/);
    await page.getByLabel('Search relics', { exact: true }).fill('Axi A21');
    await expect(page.getByLabel('Axi A21 Intact quantity', { exact: true })).toHaveText('3');
    expect(writes).toEqual([]); expect(external).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('warframe-toolkit.inventory.v1'))).toBeNull();
  });
});

// The user's reference image is temporary. Supplying it explicitly also runs
// this real-image check; no copy is kept in the repository.
if (process.env.RELIC_SCREENSHOT_PATH) test('temporary game screenshot reads every relic name, refinement and count before a preserving merge', async ({ page, account }) => {
  await page.goto('/#relics');
  const original = await account.inventory();
  original.relics = [{ ...createRelic(), name: 'Axi C12', quantity: 9, notes: 'Keep for squad' }, { ...createRelic(), name: 'Neo N1', quantity: 7, notes: 'Off screen' }];
  await account.setInventory(original); await page.reload();
  await page.getByRole('button', { name: 'Import screenshots', exact: true }).click();
  await page.getByLabel('Choose relics screenshots', { exact: true }).setInputFiles(process.env.RELIC_SCREENSHOT_PATH!);
  await review(page, example.stacks);
  expect(await account.inventory()).toEqual(original);
  await page.getByRole('button', { name: 'Select all', exact: true }).click();
  await page.getByRole('button', { name: 'Import 20 stacks', exact: true }).click();
  const saved = await account.inventory();
  expect(saved.items).toEqual(original.items);
  expect(saved.relics).toHaveLength(21);
  expect(saved.relics.find(item => item.id === original.relics[0].id)).toMatchObject({ quantity: 3, notes: 'Keep for squad' });
  expect(saved.relics.find(item => item.id === original.relics[1].id)).toEqual(original.relics[1]);
  for (const stack of example.stacks) expect(saved.relics.find(item => item.name === stack.name && item.refinement === stack.refinement)?.quantity).toBe(stack.quantity);
});
