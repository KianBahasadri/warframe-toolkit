import { test, expect } from './accountFixture';
import type { Page } from '@playwright/test';
import { initialInventory } from '../../src/data/reference';

const status = (page: Page) => page.getByRole('status', { name: 'Save status', exact: true });
async function openGuest(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeEnabled();
  await expect(status(page)).toHaveCount(0);
}
async function register(page: Page, username: string, open = true) {
  if (open) await page.getByRole('button', { name: 'Create account', exact: true }).click();
  else await page.getByRole('dialog').getByRole('button', { name: 'Create account', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create account', exact: true });
  await dialog.getByLabel('Username', { exact: true }).fill(username);
  await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(status(page)).toHaveText('Saved');
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toHaveCount(0);
}
async function signOut(page: Page, username: string) {
  await page.getByRole('button', { name: `Account: ${username}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function signIn(page: Page, username: string, open = true) {
  if (open) await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in', exact: true });
  await dialog.getByLabel('Username', { exact: true }).fill(username);
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(dialog).toHaveCount(0);
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
    await page.getByLabel('Search relics', { exact: true }).fill('Lith A1');
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
    await page.getByLabel('Search relics', { exact: true }).fill('Lith A1');
    await expect(page.getByLabel('Lith A1 Intact quantity', { exact: true })).toHaveText('0');
    await page.getByRole('link', { name: 'Weapons', exact: true }).click();
    await page.getByLabel('Search weapons').fill('Boltor');
    await expect(page.getByLabel('Owned: Boltor', { exact: true })).not.toBeChecked();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('Clerk accounts keep separate inventories and restore saved data across sign-ins', async ({ page, account }) => {
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
    await signIn(page, 'FirstTenno');
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

  test('a delayed initial sign-in check cannot replace a newly authenticated Clerk account', async ({ page, account }) => {
    let resume!: () => void;
    const pause = new Promise<void>(resolve => { resume = resolve; });
    let intercepted = false;
    await page.route('**/api/account/session', async route => {
      const hasBearer = Boolean(route.request().headers().authorization);
      const response = await route.fetch({ url: `${account.url}/api/account/session` });
      if (!hasBearer && !intercepted) {
        intercepted = true;
        await pause;
      }
      await route.fulfill({ response });
    });
    await page.goto('/droptables');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Saved views', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in to save view', exact: true }).click();
    await register(page, 'SlowSessionTenno', false);
    resume();
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
      const create = page.getByRole('button', { name: 'Create account', exact: true });
      const signInBounds = (await trigger.boundingBox())!, createBounds = (await create.boundingBox())!;
      expect(createBounds.x).toBeGreaterThan(signInBounds.x + signInBounds.width);
      expect(createBounds.y).toBe(signInBounds.y);
      expect(createBounds.x + createBounds.width).toBeLessThanOrEqual(320);
      await create.focus(); await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toHaveAccessibleName('Create account');
      await expect(page.getByLabel('Username', { exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(create).toBeFocused();
      await trigger.focus(); await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByLabel('Username', { exact: true })).toBeFocused();
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
  expect((await download).suggestedFilename()).toBe('grakata-unsaved-profile.json');
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
  await signIn(page, 'TestTenno', false);
  expect((await account.inventory()).items.find(item => item.name === 'Boltor')!.mastered).toBe(false);
});

test('signing in again cannot overwrite changes saved on another device', async ({ page, account }) => {
  await page.goto('/');
  const remote = await account.inventory();
  remote.items.find(item => item.name === 'Boltor')!.notes = 'Saved on another device';
  await account.setInventory(remote);
  await account.signOut();
  await page.getByLabel('Mastered: Boltor', { exact: true }).uncheck();
  await expect(status(page)).toHaveText('Unsaved changes');
  await expect(page.getByRole('alert')).toContainText('Sign in to save your changes.');
  await page.getByRole('button', { name: 'Account: TestTenno', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in again', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in', exact: true });
  await dialog.getByLabel('Username', { exact: true }).fill('TestTenno');
  await dialog.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'another tab or device' }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(status(page)).toHaveText('Unsaved changes');
  await expect(page.getByLabel('Mastered: Boltor', { exact: true })).not.toBeChecked();
  expect((await account.session()).profile.inventory).toEqual(remote);
});

test('sign-out closes account details when Clerk clears the user before its promise resolves', async ({ page, account }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await account.profile();
  await page.evaluate(() => {
    const win = window as Window & { Clerk?: { signOut: () => Promise<void> }; finishSignOut?: () => void };
    const original = win.Clerk!.signOut.bind(win.Clerk);
    win.Clerk!.signOut = async () => {
      await original();
      await new Promise<void>(resolve => { win.finishSignOut = resolve; });
    };
  });
  await page.getByRole('button', { name: 'Account: TestTenno', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => (window as Window & { finishSignOut?: () => void }).finishSignOut?.());
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Sign in', exact: true })).toBeVisible();
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

test('hovering the username opens account options, clicking opens the modal, and replacing a shared inventory link revokes the old link', async ({ page, account }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as Window & { copiedText?: string }).copiedText = text; } } }));
  await page.goto('/'); await account.profile();
  const trigger = page.getByRole('button', { name: 'Account: TestTenno', exact: true });
  const menu = page.getByRole('menu', { name: 'Account options', exact: true });

  await trigger.hover();
  await expect(menu.getByRole('menuitem')).toHaveText(['Share inventory', 'Change language', 'Sign out']);
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const menuBox = (await menu.boundingBox())!;
  expect(menuBox.height).toBeLessThanOrEqual(148);

  await menu.getByRole('menuitem', { name: 'Change language', exact: true }).click();
  const languageMenu = page.getByRole('menu');
  await expect(languageMenu.getByRole('menuitemradio', { name: 'English', exact: true })).toBeChecked();
  await languageMenu.getByRole('menuitemradio', { name: '简体中文', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('zh-CN');
  await expect(page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('link', { name: '武器', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Boltor', exact: true })).toBeVisible();
  await expect(languageMenu.getByRole('menuitem', { name: '更改语言', exact: true })).toBeVisible();
  await languageMenu.getByRole('menuitemradio', { name: 'English', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);

  await trigger.click();
  await expect(menu).toHaveCount(0);
  const dialog = page.getByRole('dialog', { name: 'Account', exact: true });
  await expect(dialog.getByRole('button', { name: 'Share inventory', exact: true })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'English', exact: true })).toBeChecked();
  await expect(dialog.getByRole('radio', { name: '简体中文', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await trigger.hover();
  await menu.getByRole('menuitem', { name: 'Share inventory', exact: true }).click();
  const shareDialog = page.getByRole('dialog', { name: 'Share inventory', exact: true });
  await expect(shareDialog).toBeVisible();
  const shareInput = shareDialog.getByLabel('Shareable link', { exact: true });
  await expect(shareInput).toHaveValue(/\/weapons\?share=wfs_[A-Za-z0-9_-]{43}$/);
  const firstShareLink = await shareInput.inputValue();
  await shareDialog.getByRole('button', { name: 'Copy link', exact: true }).click();
  expect(await page.evaluate(() => (window as Window & { copiedText?: string }).copiedText)).toBe(firstShareLink);
  await shareDialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(shareDialog).toHaveCount(0);

  await trigger.hover();
  await menu.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();

  await page.goto(firstShareLink);
  await expect(page.getByRole('status').filter({ hasText: 'Viewing TestTenno’s live inventory.' })).toBeVisible();
  await expect(page.getByLabel('Owned: Boltor', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Owned: Boltor', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add weapon', exact: true })).toHaveCount(0);

  await signIn(page, 'TestTenno');
  await page.getByRole('button', { name: 'View my inventory', exact: true }).click();
  await expect(page).toHaveURL(/\/weapons$/);
  await page.getByLabel('Mastered: Boltor', { exact: true }).uncheck();
  await account.profile();

  await page.goto(firstShareLink);
  await expect(page.getByLabel('Mastered: Boltor', { exact: true })).not.toBeChecked();

  await trigger.click();
  await page.getByRole('dialog', { name: 'Account', exact: true }).getByRole('button', { name: 'Share inventory', exact: true }).click();
  await expect(shareInput).toHaveValue(firstShareLink);
  await shareDialog.getByRole('button', { name: 'Generate new link', exact: true }).click();
  await expect(shareInput).not.toHaveValue(firstShareLink);
  const secondShareLink = await shareInput.inputValue();
  expect(secondShareLink).toMatch(/\/weapons\?share=wfs_[A-Za-z0-9_-]{43}$/);
  await shareDialog.getByRole('button', { name: 'Done', exact: true }).click();

  await page.goto(firstShareLink);
  await expect(page.getByRole('alert')).toContainText('invalid or has been replaced');
  await expect(page.getByLabel('Owned: Boltor', { exact: true })).toHaveCount(0);

  await page.goto(secondShareLink);
  await expect(page.getByRole('status').filter({ hasText: 'Viewing TestTenno’s live inventory.' })).toBeVisible();
  await expect(page.getByLabel('Owned: Boltor', { exact: true })).toBeChecked();
  await expect(page.getByLabel('Mastered: Boltor', { exact: true })).not.toBeChecked();
});
