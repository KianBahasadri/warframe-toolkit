import { test, expect } from './accountFixture';
import { createEquipment } from '../../src/lib/model';
import { createRelic } from '../../src/lib/relics';
import { catalog } from '../../src/data/catalog';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('arsenal.inventory-columns', JSON.stringify(['name', 'dontKeep', 'override', 'notes'])));
});

test('inline notes autosave across collections and navigation, preserving other fields and removing obsolete columns', async ({ page, account }) => {
  await page.goto('/');
  const inventory = await account.inventory();
  inventory.items = [
    createEquipment(catalog.find(item => item.name === 'Anku')!, { dontKeep: true, override: 'Keep', notes: 'Original plan', rank: 7, mastered: false }),
    createEquipment(catalog.find(item => item.name === 'Wisp')!, { helminth: 'No' }),
  ];
  inventory.relics = [{ ...createRelic(), name: 'Lith A1', quantity: 2 }];
  await account.setInventory(inventory); await page.reload();
  await expect(page.getByRole('columnheader')).toHaveText(['Weapon', 'Notes']);
  await page.getByRole('button', { name: 'Columns', exact: true }).click();
  const columns = page.getByRole('group', { name: 'Table columns' });
  await expect(columns.getByRole('checkbox', { name: "Don't keep", exact: true })).toHaveCount(0);
  await expect(columns.getByRole('checkbox', { name: 'Override', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Edit notes for Anku', exact: true }).click();
  const anku = page.getByRole('textbox', { name: 'Notes for Anku', exact: true });
  await expect(anku).toBeFocused();
  await anku.fill('Forma plan\nTest another build');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Warframes', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Notifications' })).toContainText('Notes saved for Anku.');
  const addWispNote = page.getByRole('button', { name: 'Edit notes for Wisp', exact: true });
  await expect(addWispNote).toHaveText('');
  await expect(addWispNote.locator('svg')).toBeVisible();
  await addWispNote.focus();
  await addWispNote.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Notes for Wisp', exact: true })).toBeFocused();
  await page.getByRole('textbox', { name: 'Notes for Wisp', exact: true }).fill('Unlock Helminth first');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Edit notes for Wisp', exact: true })).toBeFocused();
  await page.getByRole('link', { name: 'Relics', exact: true }).click();
  await page.getByRole('button', { name: 'Edit notes for Lith A1 Intact', exact: true }).click();
  const relic = page.getByRole('textbox', { name: 'Notes for Lith A1 Intact', exact: true });
  await relic.fill('Refine with squad');
  await relic.press('End'); await relic.press('Enter'); await relic.pressSequentially('Keep two');
  await expect(relic).toHaveValue('Refine with squad\nKeep two');
  await expect(page.getByRole('region', { name: 'Notifications' })).toContainText('Notes saved for Lith A1 Intact.');
  const saved = await account.inventory();
  expect(saved.items[0]).toEqual({ ...inventory.items[0], notes: 'Forma plan\nTest another build', updatedAt: expect.any(String) });
  expect(saved.items[1]).toEqual({ ...inventory.items[1], notes: 'Unlock Helminth first', updatedAt: expect.any(String) });
  expect(saved.relics[0]).toEqual({ ...inventory.relics[0], notes: 'Refine with squad\nKeep two', updatedAt: expect.any(String) });
  await page.screenshot({ path: 'test-results/inline-relic-notes.png' });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Edit notes for Lith A1 Intact', exact: true })).toHaveText('Refine with squad\nKeep two');
  await page.getByRole('link', { name: 'Weapons', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit notes for Anku', exact: true })).toHaveText('Forma plan\nTest another build');
});

test('failed notes stay editable, only confirmed saves show success, and notes can be cleared', async ({ page, account }) => {
  await page.goto('/'); await account.inventory();
  let fail = true;
  await page.route('**/api/account/profile', route => fail ? route.fulfill({ status: 503, json: { error: 'Save unavailable; please retry.' } }) : route.fallback());
  await page.getByRole('button', { name: 'Edit notes for Anku', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Notes for Anku', exact: true });
  await field.fill('Keep this unsaved draft');
  await expect(page.getByRole('status', { name: 'Save status', exact: true })).toHaveText('Unsaved changes');
  await expect(field).toHaveValue('Keep this unsaved draft');
  await expect(page.getByRole('region', { name: 'Notifications' })).toBeEmpty();
  expect((await account.session()).profile.inventory.items.find(item => item.name === 'Anku')!.notes).not.toBe('Keep this unsaved draft');
  fail = false;
  await page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Notifications' })).toContainText('Notes saved for Anku.');
  expect((await account.inventory()).items.find(item => item.name === 'Anku')!.notes).toBe('Keep this unsaved draft');
  await page.getByRole('button', { name: 'Edit notes for Anku', exact: true }).click();
  await field.fill('');
  await field.press('Escape');
  await expect(page.getByRole('button', { name: 'Edit notes for Anku', exact: true })).toBeFocused();
  expect((await account.inventory()).items.find(item => item.name === 'Anku')!.notes).toBe('');
  await page.reload();
  const addNote = page.getByRole('button', { name: 'Edit notes for Anku', exact: true });
  await expect(addNote).toHaveText('');
  await expect(addNote.locator('svg')).toBeVisible();
  await addNote.click();
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('');
});

test('typing notes on untracked catalog equipment retains focus and creates only that unowned record', async ({ page, account }) => {
  await page.goto('/');
  await account.setInventory({ ...(await account.inventory()), items: [] }); await page.reload();
  await page.getByRole('button', { name: 'Browse all weapons', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search weapons', exact: true }).fill('Phenmor');
  await page.getByRole('button', { name: 'Edit notes for Phenmor', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Notes for Phenmor', exact: true });
  await field.pressSequentially('Try this build', { delay: 30 });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('Try this build');
  const inventory = await account.inventory();
  expect(inventory.items).toHaveLength(1);
  expect(inventory.items[0]).toMatchObject({ name: 'Phenmor', owned: false, mastered: false, notes: 'Try this build' });
});

test.describe('guest notes', () => {
  test.use({ signedIn: false });
  test('temporary notes never claim to be saved or enter browser storage', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('textbox', { name: 'Search weapons', exact: true }).fill('Phenmor');
    await page.getByRole('button', { name: 'Edit notes for Phenmor', exact: true }).click();
    await page.getByRole('textbox', { name: 'Notes for Phenmor', exact: true }).fill('Temporary guest plan');
    await expect(page.getByRole('region', { name: 'Notifications' })).toContainText('Notes updated for Phenmor. Sign in to save.');
    await expect(page.getByRole('region', { name: 'Notifications' })).not.toContainText('Notes saved');
    expect(await page.evaluate(() => localStorage.getItem('warframe-toolkit.inventory.v1'))).toBeNull();
    await page.reload();
    await page.getByRole('textbox', { name: 'Search weapons', exact: true }).fill('Phenmor');
    await expect(page.getByRole('button', { name: 'Edit notes for Phenmor', exact: true })).toHaveText('');
  });
});
