import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { test, expect } from './accountFixture';
import { createRelic } from '../../src/lib/relics';
import example from '../fixtures/relic-screenshot.json' with { type: 'json' };
import thirdCapture from '../fixtures/relic-capture-third.json' with { type: 'json' };

const synthetic = [
  { name: 'Axi A21', refinement: 'Intact', quantity: 3 },
  { name: 'Axi C12', refinement: 'Intact', quantity: 2 },
  { name: 'Lith A13', refinement: 'Radiant', quantity: 4 },
  { name: 'Lith A13', refinement: 'Intact', quantity: 1 },
  { name: 'Lith G14', refinement: 'Radiant', quantity: 6 },
  { name: 'Lith L8', refinement: 'Intact', quantity: 12 },
];

async function screenshot(page: Page, stacks = synthetic, color = '#e0c878') {
  const base64 = await page.evaluate(async ({ stacks, color }) => {
    // Use the bundled font: system Arial fallbacks change the OCR input on CI.
    const font = '24px "IBM Plex Sans"';
    if (!(await document.fonts.load(font)).length) throw new Error('Screenshot fixture font did not load.');
    const canvas = document.createElement('canvas'); canvas.width = 1100; canvas.height = 760;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#101418'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color; ctx.font = font;
    stacks.forEach((stack, index) => {
      const center = 180 + index % 3 * 300, bottom = 300 + Math.floor(index / 3) * 340;
      ctx.textAlign = 'center'; ctx.fillText(`${stack.name} Relic`, center, bottom - (stack.refinement === 'Intact' ? 0 : 32));
      if (stack.refinement !== 'Intact') ctx.fillText(`[${stack.refinement}]`, center, bottom);
      ctx.textAlign = 'left'; if (stack.quantity > 1) ctx.fillText(`x${stack.quantity}`, center - 105, bottom - 200);
    });
    return canvas.toDataURL('image/png').split(',')[1];
  }, { stacks, color });
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
  await expect(page.getByRole('checkbox', { name: 'Import Lith A13 Intact', exact: true })).toBeChecked();
  expect(await account.inventory()).toEqual(original);
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
  const example = page.getByRole('img', { name: /Example Warframe Void Relics/ });
  await expect(example).toBeVisible();
  await expect(example).toHaveJSProperty('naturalWidth', 1920);
  await expect(example).toHaveJSProperty('naturalHeight', 1200);
  await page.getByRole('button', { name: 'Relics instructions', exact: true }).click();
  const guide = page.getByRole('dialog', { name: 'Relic screenshots' });
  await expect(guide).toContainText('Void Relics / Refinement');
  await expect(guide.getByRole('img', { name: /Warframe Void Relics/ })).toHaveJSProperty('naturalWidth', 1920);
  await expect(guide.getByRole('link', { name: 'Open full-size example' })).toHaveAttribute('href', '/images/import/relics.png');
  expect(await guide.evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await page.getByLabel('Choose relics screenshots', { exact: true }).setInputFiles(await screenshot(page));
  await review(page, synthetic);
  await expect(example).toHaveCount(0);
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
    await page.getByRole('button', { name: 'Import 6 stacks', exact: true }).click();
    await expect(page).toHaveURL(/#relics$/);
    await page.getByLabel('Search relics', { exact: true }).fill('Axi A21');
    await expect(page.getByLabel('Axi A21 Intact quantity', { exact: true })).toHaveText('3');
    expect(writes).toEqual([]); expect(external).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('warframe-toolkit.inventory.v1'))).toBeNull();
  });
});

test('game screenshot reads every relic name, refinement and count before a preserving merge', async ({ page, account }) => {
  await page.goto('/#relics');
  const original = await account.inventory();
  original.relics = [{ ...createRelic(), name: 'Axi C12', quantity: 9, notes: 'Keep for squad' }, { ...createRelic(), name: 'Neo N1', quantity: 7, notes: 'Off screen' }];
  await account.setInventory(original); await page.reload();
  await page.getByRole('button', { name: 'Import screenshots', exact: true }).click();
  await page.getByLabel('Choose relics screenshots', { exact: true }).setInputFiles(process.env.RELIC_SCREENSHOT_PATH || 'tests/fixtures/relic-grid.png');
  await review(page, example.stacks);
  await expect(page.locator('.relic-review-table .caution-badge')).toHaveCount(0);
  for (const stack of example.stacks) await expect(page.getByRole('checkbox', { name: `Import ${stack.name} ${stack.refinement}`, exact: true })).toBeChecked();
  expect(await account.inventory()).toEqual(original);
  await page.getByRole('button', { name: 'Import 20 stacks', exact: true }).click();
  const saved = await account.inventory();
  expect(saved.items).toEqual(original.items);
  expect(saved.relics).toHaveLength(21);
  expect(saved.relics.find(item => item.id === original.relics[0].id)).toMatchObject({ quantity: 3, notes: 'Keep for squad' });
  expect(saved.relics.find(item => item.id === original.relics[1].id)).toEqual(original.relics[1]);
  for (const stack of example.stacks) expect(saved.relics.find(item => item.name === stack.name && item.refinement === stack.refinement)?.quantity).toBe(stack.quantity);
});

test('a grid containing only singles reads quantities and refinements without badges, including white text', async ({ page }) => {
  await page.goto('/#relics');
  await page.getByRole('button', { name: 'Import screenshots', exact: true }).click();
  const stacks = synthetic.map(stack => ({ ...stack, quantity: 1 }));
  await page.getByLabel('Choose relics screenshots', { exact: true }).setInputFiles(await screenshot(page, stacks, '#e4e4e4'));
  await review(page, stacks);
  await expect(page.getByRole('button', { name: 'Import 6 stacks', exact: true })).toBeEnabled();
  await expect(page.locator('.relic-review-table .caution-badge')).toHaveCount(0);
});

test('a second full game capture separates Radiant labels despite artwork in the OCR boxes', async ({ page }) => {
  await page.goto('/#relics');
  await page.getByRole('button', { name: 'Import screenshots', exact: true }).click();
  // Keep the full capture: cropping it changes whole-screen OCR boxes and
  // hides the regression that merged all six name/refinement pairs.
  await page.getByLabel('Choose relics screenshots', { exact: true }).setInputFiles('public/images/import/relics.png');
  await review(page, example.stacks);
  await expect(page.locator('.relic-review-table .caution-badge')).toHaveCount(0);
  for (const stack of example.stacks) await expect(page.getByRole('checkbox', { name: `Import ${stack.name} ${stack.refinement}`, exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Import 20 stacks', exact: true })).toBeEnabled();
});

test('a third full game capture reads every stack without review warnings', async ({ page }) => {
  await page.goto('/#relics');
  await page.getByRole('button', { name: 'Import screenshots', exact: true }).click();
  await page.getByLabel('Choose relics screenshots', { exact: true }).setInputFiles('tests/fixtures/relic-capture-third.png');
  await review(page, thirdCapture.stacks);
  await expect(page.locator('.relic-review-table .caution-badge')).toHaveCount(0);
  for (const stack of thirdCapture.stacks) await expect(page.getByRole('checkbox', { name: `Import ${stack.name} ${stack.refinement}`, exact: true })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Import 20 stacks', exact: true })).toBeEnabled();
});

for (const change of ['resized JPEG', 'cropped quantities', 'cropped refinements'] as const) test(`game screenshot handles ${change}`, async ({ page }) => {
  await page.goto('/#relics');
  await page.getByRole('button', { name: 'Import screenshots', exact: true }).click();
  const source = readFileSync('tests/fixtures/relic-grid.png').toString('base64');
  const data = await page.evaluate(async ({ source, change }) => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(source), c => c.charCodeAt(0))]));
    const canvas = document.createElement('canvas');
    const top = change === 'cropped quantities' ? 110 : 0;
    const height = change === 'cropped refinements' ? 882 : bitmap.height - top;
    const scale = change === 'resized JPEG' ? 0.75 : 1;
    const margin = change === 'resized JPEG' ? 60 : 0;
    canvas.width = Math.round(bitmap.width * scale) + margin * 2; canvas.height = Math.round(height * scale) + margin;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#101418'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, top, bitmap.width, height, margin, margin, bitmap.width * scale, height * scale);
    bitmap.close();
    return canvas.toDataURL(change === 'resized JPEG' ? 'image/jpeg' : 'image/png', 0.85).split(',')[1];
  }, { source, change });
  await page.getByLabel('Choose relics screenshots', { exact: true }).setInputFiles({ name: 'modified-relics.png', mimeType: change === 'resized JPEG' ? 'image/jpeg' : 'image/png', buffer: Buffer.from(data, 'base64') });
  await expect(page.getByRole('button', { name: 'Cancel reading', exact: true })).toHaveCount(0, { timeout: 60_000 });
  if (change === 'resized JPEG') {
    await review(page, example.stacks);
    await expect(page.getByRole('button', { name: 'Import 20 stacks', exact: true })).toBeEnabled();
    await expect(page.locator('.relic-review-table .caution-badge')).toHaveCount(0);
  } else if (change === 'cropped quantities') {
    const rows = page.locator('.relic-review-table tbody tr');
    await expect(rows).toHaveCount(20);
    for (let index = 0; index < 5; index++) {
      await expect(rows.nth(index).getByRole('spinbutton')).toHaveValue('');
      await expect(rows.nth(index).getByRole('checkbox')).not.toBeChecked();
      await expect(rows.nth(index)).toContainText('Quantity cropped');
    }
  } else {
    const rows = page.locator('.relic-review-table tbody tr');
    // The two Intact names are below the crop. The three remaining names must
    // stay in review without assuming their clipped refinements were Intact.
    await expect(rows).toHaveCount(18);
    for (let index = 15; index < 18; index++) await expect(rows.nth(index).getByRole('checkbox')).not.toBeChecked();
    await expect(page.locator('.relic-review-table').getByText('Choose refinement', { exact: true }).first()).toBeVisible();
  }
});
