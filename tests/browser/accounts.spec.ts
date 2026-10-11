import { test, expect, testPassword } from './accountFixture';
import type { Page } from '@playwright/test';
import { initialInventory } from '../../src/data/reference';
import { defaultDropView } from '../../src/lib/dropTables';

const status = (page: Page) => page.getByRole('status', { name: 'Save status', exact: true });
async function openGuest(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await expect(status(page)).toHaveCount(0);
}
async function register(page: Page, username: string, open = true) {
  if (open) await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create account', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create account', exact: true });
  await dialog.getByLabel('Warframe username', { exact: true }).fill(username);
  await dialog.getByLabel('Password', { exact: true }).fill(testPassword);
  await dialog.getByLabel('Confirm password', { exact: true }).fill(testPassword);
  await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(status(page)).toHaveText('Saved');
}
async function signOut(page: Page, username: string) {
  await page.getByRole('button', { name: `Account: ${username}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function signIn(page: Page, username: string, password = testPassword) {
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in', exact: true });
  await dialog.getByLabel('Warframe username', { exact: true }).fill(username);
  await dialog.getByLabel('Password', { exact: true }).fill(password);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test.describe('guest accounts', () => {
  test.use({ signedIn: false });

  test('guests browse the full catalog and make temporary edits without saving personal data', async ({ page, account }) => {
    const writes: string[] = [];
    page.on('request', req => { if (req.url().includes('/api/account/') && req.method() !== 'GET') writes.push(req.url()); });
    await openGuest(page);
    expect(await page.getByRole('button', { name: /^Edit / }).count()).toBeGreaterThan(650);
    await page.getByLabel('Search weapons').fill('Boltor');
    await page.getByLabel('Owned: Boltor', { exact: true }).check();
    await expect(status(page)).toHaveCount(0);
    await page.getByRole('link', { name: 'Relics', exact: true }).click();
    await page.getByRole('button', { name: 'Add relic', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Relic name').fill('Lith A1');
    await dialog.getByRole('button', { name: 'Add relic', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Edit Lith A1 Intact' })).toBeVisible();
    expect(writes).toEqual([]);
    expect((await account.session()).user).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('warframe-toolkit.inventory.v1'))).toBeNull();
    page.on('dialog', dialog => dialog.accept());
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    await expect(page.getByText('No relics added.', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Weapons', exact: true }).click();
    await page.getByLabel('Search weapons').fill('Boltor');
    await expect(page.getByLabel('Owned: Boltor', { exact: true })).not.toBeChecked();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.locator('input[type=email]')).toHaveCount(0);
  });

  test('signup copies reviewed legacy data, preserves originals, and keeps passwords out of browser storage', async ({ page, context, account }) => {
    const legacy = initialInventory();
    const views = [{ name: 'My relic search', view: { ...defaultDropView(), query: 'relic:lith' } }];
    await page.addInitScript(({ inventory, views }) => {
      if (!localStorage.getItem('warframe-toolkit.inventory.v1')) localStorage.setItem('warframe-toolkit.inventory.v1', JSON.stringify(inventory));
      localStorage.setItem('warframe-toolkit.drop-views.v1', JSON.stringify(views));
    }, { inventory: legacy, views });
    await openGuest(page);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(dialog.getByLabel('Save my current inventory and views to this account')).toBeChecked();
    await expect(dialog.locator('input')).toHaveCount(4);
    await dialog.getByLabel('Warframe username', { exact: true }).fill('LegacyTenno#123');
    await dialog.getByLabel('Password', { exact: true }).fill(testPassword);
    await dialog.getByLabel('Confirm password', { exact: true }).fill('different password');
    await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Passwords do not match.');
    await dialog.getByLabel('Confirm password', { exact: true }).fill(testPassword);
    await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await account.profile()).toEqual({ inventory: legacy, dropViews: views });
    const boltor = page.getByLabel('Owned: Boltor', { exact: true });
    await boltor.click();
    await expect(boltor).toHaveCount(0);
    await account.profile();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Account: LegacyTenno#123', exact: true })).toBeVisible();
    expect((await account.inventory()).items.find(item => item.name === 'Boltor')!.owned).toBe(false);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('warframe-toolkit.inventory.v1')!))).toEqual(legacy);
    const cookies = await context.cookies();
    const cookie = cookies.find(cookie => cookie.name === 'warframe_toolkit_session')!;
    expect(cookie.httpOnly).toBe(true); expect(cookie.sameSite).toBe('Lax');
    expect(await page.evaluate(() => document.cookie)).not.toContain('warframe_toolkit_session');
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(testPassword);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(cookie.value);
  });

  test('usernames sign in without case sensitivity, and separate accounts keep separate inventories', async ({ page, account }) => {
    await openGuest(page);
    await register(page, 'FirstTenno');
    expect((await account.inventory()).items).toEqual([]);
    await page.getByRole('button', { name: 'Browse all weapons', exact: true }).click();
    await page.getByLabel('Search weapons').fill('Boltor');
    await page.getByLabel('Owned: Boltor', { exact: true }).check();
    await account.profile();
    await signOut(page, 'FirstTenno');
    await register(page, 'SecondTenno');
    expect((await account.inventory()).items).toEqual([]);
    await signOut(page, 'SecondTenno');
    await signIn(page, 'FIRSTTENNO', 'wrong password');
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Username or password is incorrect.');
    await page.getByRole('dialog').getByLabel('Password', { exact: true }).fill(testPassword);
    await page.getByRole('dialog').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const inventory = await account.inventory();
    expect(inventory.items).toHaveLength(1);
    expect(inventory.items[0]).toMatchObject({ name: 'Boltor', owned: true });
    await page.getByRole('link', { name: 'Drop Tables', exact: true }).click();
    await signOut(page, 'FirstTenno');
    await page.getByRole('button', { name: 'Saved views', exact: true }).click();
    await expect(page.getByLabel('View name', { exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Sign in to save view', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('a delayed initial sign-in check cannot replace a newly created account', async ({ page, context, baseURL, account }) => {
    const previous = await context.request.post(`${account.url}/api/account/register`, { headers: { Origin: baseURL!, 'X-Toolkit-Request': '1' }, data: { username: 'PreviousTenno', password: testPassword } });
    expect(previous.status()).toBe(201);
    let resume!: () => void;
    const pause = new Promise<void>(resolve => { resume = resolve; });
    await page.route('**/api/account/session', async route => {
      const response = await route.fetch({ url: `${account.url}/api/account/session` });
      await pause;
      await route.fulfill({ response });
    });
    await page.goto('/#droptables');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Saved views', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in to save view', exact: true }).click();
    await register(page, 'SlowSessionTenno', false);
    const checked = page.waitForResponse('**/api/account/session');
    resume(); await checked;
    await expect(page.getByRole('button', { name: 'Account: SlowSessionTenno', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Weapons', exact: true }).click();
    await page.getByRole('button', { name: 'Browse all weapons', exact: true }).click();
    await page.getByLabel('Search weapons').fill('Boltor');
    await page.getByLabel('Owned: Boltor', { exact: true }).check();
    expect((await account.inventory()).items[0]).toMatchObject({ name: 'Boltor', owned: true });
  });

  test('account forms fit narrow screens, restore keyboard focus, and work in both themes', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await openGuest(page);
    const trigger = page.getByRole('button', { name: 'Sign in', exact: true });
    for (const theme of ['dark', 'light']) {
      await trigger.focus(); await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByLabel('Warframe username', { exact: true })).toBeFocused();
      await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
      const bounds = await dialog.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(720);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/account-${theme}-mobile.png`, fullPage: true });
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      if (theme === 'dark') await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
    }
    await page.setViewportSize({ width: 1280, height: 850 });
    await register(page, 'A'.repeat(64));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: 'test-results/account-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 320, height: 720 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test('failed account saves retain edits, block sign-out until saved, and retry the latest changes', async ({ page, account }) => {
  await page.goto('/'); await account.profile();
  let fail = true;
  await page.route('**/api/account/profile', route => fail ? route.fulfill({ status: 503, json: { error: 'Account service is temporarily unavailable.' } }) : route.fallback());
  await page.getByLabel('Mastered: Boltor', { exact: true }).uncheck();
  await page.getByLabel('Mastered: Anku', { exact: true }).uncheck();
  await expect(status(page)).toHaveText('Unsaved changes');
  await expect(page.getByRole('alert')).toContainText('temporarily unavailable');
  await page.getByRole('button', { name: 'Account: TestTenno', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('have not been saved');
  await page.keyboard.press('Escape');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download changes', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('arsenal-unsaved-profile.json');
  fail = false;
  await page.getByRole('button', { name: 'Try saving again', exact: true }).click();
  const inventory = await account.inventory();
  expect(inventory.items.find(item => item.name === 'Boltor')!.mastered).toBe(false);
  expect(inventory.items.find(item => item.name === 'Anku')!.mastered).toBe(false);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a conflicting save never overwrites another tab, and the saved version can be explicitly loaded', async ({ page, account }) => {
  await page.goto('/');
  const remote = await account.inventory();
  remote.items.find(item => item.name === 'Boltor')!.notes = 'Changed in another tab';
  await account.setInventory(remote);
  await page.getByLabel('Mastered: Boltor', { exact: true }).uncheck();
  await expect(status(page)).toHaveText('Unsaved changes');
  await expect(page.getByRole('alert')).toContainText('another tab or device');
  expect((await account.session()).profile.inventory).toEqual(remote);
  await page.getByRole('button', { name: 'Discard changes and reload saved data', exact: true }).click();
  expect(await account.inventory()).toEqual(remote);
  await page.getByRole('button', { name: 'Edit Boltor', exact: true }).click();
  await page.getByRole('tab', { name: 'My inventory', exact: true }).click();
  await expect(page.getByLabel('Notes', { exact: true })).toHaveValue('Changed in another tab');
});

test('signing in again after a session ends preserves unsaved changes', async ({ page, account }) => {
  await page.goto('/'); await account.profile();
  await account.signOut();
  await page.getByLabel('Mastered: Boltor', { exact: true }).uncheck();
  await expect(status(page)).toHaveText('Unsaved changes');
  await expect(page.getByRole('alert')).toContainText('Sign in to save your changes.');
  await page.getByRole('button', { name: 'Account: TestTenno', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in again', exact: true }).click();
  await expect(page.getByLabel('Warframe username', { exact: true })).toHaveAttribute('readonly', '');
  await page.getByLabel('Password', { exact: true }).fill(testPassword);
  await page.getByRole('dialog').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await account.inventory()).items.find(item => item.name === 'Boltor')!.mastered).toBe(false);
});


test('edits made while loading a saved version remain in the current draft', async ({ page, account }) => {
  await page.goto('/');
  const remote = await account.inventory();
  remote.items.find(item => item.name === 'Boltor')!.notes = 'Changed elsewhere';
  await account.setInventory(remote);
  await page.getByLabel('Mastered: Boltor', { exact: true }).uncheck();
  await expect(status(page)).toHaveText('Unsaved changes');
  let resume!: () => void, loaded!: () => void;
  const paused = new Promise<void>(resolve => { resume = resolve; });
  const requested = new Promise<void>(resolve => { loaded = resolve; });
  await page.route('**/api/account/session', async route => {
    const response = await route.fetch({ url: `${account.url}/api/account/session` });
    loaded(); await paused;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Discard changes and reload saved data', exact: true }).click();
  await requested;
  await page.getByLabel('Mastered: Anku', { exact: true }).uncheck();
  resume();
  await expect(status(page)).toHaveText('Unsaved changes');
  await expect(page.getByLabel('Mastered: Anku', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Mastered: Boltor', { exact: true })).not.toBeChecked();
  expect((await account.session()).profile.inventory).toEqual(remote);
  await page.unroute('**/api/account/session');
  await page.getByRole('button', { name: 'Discard changes and reload saved data', exact: true }).click();
  expect(await account.inventory()).toEqual(remote);
});
