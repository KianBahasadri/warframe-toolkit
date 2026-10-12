import { test, expect } from './accountFixture';
import type { Page } from '@playwright/test';
import { initialInventory } from '../../src/data/reference';
import { defaultDropView } from '../../src/lib/dropTables';
import { accessKeyLink } from '../../src/lib/account';
import { readFile } from 'node:fs/promises';

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
  await dialog.getByLabel('Warframe username', { exact: true }).fill(username);
  await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
  const credentials = await saveKey(page);
  await expect(status(page)).toHaveText('Saved');
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toHaveCount(0);
  return credentials;
}
async function saveKey(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Save your access key', exact: true });
  await expect(dialog).toBeVisible();
  const accessKey = await dialog.getByLabel('Access key', { exact: true }).inputValue();
  const link = await dialog.getByLabel('Personal sign-in link', { exact: true }).inputValue();
  expect(accessKey).toMatch(/^wft_[A-Za-z0-9_-]{43}$/);
  await dialog.getByLabel('I have saved my key or sign-in link', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  return { accessKey, link };
}
async function signOut(page: Page, username: string) {
  await page.getByRole('button', { name: `Account: ${username}`, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function signIn(page: Page, username: string, accessKey: string) {
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Sign in', exact: true });
  await dialog.getByLabel('Warframe username', { exact: true }).fill(username);
  await dialog.getByLabel('Access key', { exact: true }).fill(accessKey);
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
    await expect(page.getByText('Created an account with a password?')).toHaveCount(0);
  });

  test('signup copies reviewed legacy data, preserves originals, and keeps access keys out of browser storage', async ({ page, context, account }) => {
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
    await expect(dialog.locator('input')).toHaveCount(2);
    await dialog.getByLabel('Warframe username', { exact: true }).fill('LegacyTenno#123');
    await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
    const { accessKey } = await saveKey(page);
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
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(accessKey);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain(cookie.value);
  });

  test('usernames sign in without case sensitivity, and separate accounts keep separate inventories', async ({ page, account }) => {
    await openGuest(page);
    const { accessKey } = await register(page, 'FirstTenno');
    expect((await account.inventory()).items).toEqual([]);
    await page.getByRole('button', { name: 'Browse all weapons', exact: true }).click();
    await page.getByLabel('Search weapons').fill('Boltor');
    await page.getByLabel('Owned: Boltor', { exact: true }).check();
    await account.profile();
    await signOut(page, 'FirstTenno');
    await register(page, 'SecondTenno');
    expect((await account.inventory()).items).toEqual([]);
    await signOut(page, 'SecondTenno');
    await signIn(page, 'FIRSTTENNO', 'wrong key');
    await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Username or access key is incorrect.');
    await page.getByRole('dialog').getByLabel('Access key', { exact: true }).fill(accessKey);
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
    const previous = await context.request.post(`${account.url}/api/account/register`, { headers: { Origin: baseURL!, 'X-Toolkit-Request': '1' }, data: { username: 'PreviousTenno' } });
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
    await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeDisabled();
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
      const create = page.getByRole('button', { name: 'Create account', exact: true });
      const signInBounds = (await trigger.boundingBox())!, createBounds = (await create.boundingBox())!;
      expect(createBounds.x).toBeGreaterThan(signInBounds.x + signInBounds.width);
      expect(createBounds.y).toBe(signInBounds.y);
      expect(createBounds.x + createBounds.width).toBeLessThanOrEqual(320);
      await create.focus(); await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toHaveAccessibleName('Create account');
      await expect(page.getByLabel('Warframe username', { exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(create).toBeFocused();
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
  await expect(page.getByLabel('Warframe username', { exact: true })).toHaveAttribute('readonly', '');
  await page.getByLabel('Access key', { exact: true }).fill(account.accessKey);
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

test.describe('generated keys and personal bookmarks', () => {
  test.use({ signedIn: false });

  test('signup requires saving the key, offers copy and download, and fits mobile themes', async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as Window & { copiedText?: string }).copiedText = text; } } }));
    await openGuest(page);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(dialog.locator('input[type=password]')).toHaveCount(0);
    await dialog.getByLabel('Warframe username', { exact: true }).fill('BookmarkTenno#123');
    await dialog.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(dialog).toHaveAccessibleName('Save your access key');
    const key = await dialog.getByLabel('Access key', { exact: true }).inputValue();
    const link = await dialog.getByLabel('Personal sign-in link', { exact: true }).inputValue();
    await expect(dialog.getByRole('button', { name: 'Done', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveText('Save your key or sign-in link, then confirm below.');
    await dialog.getByRole('button', { name: 'Copy key', exact: true }).click();
    expect(await page.evaluate(() => (window as Window & { copiedText?: string }).copiedText)).toBe(key);
    await dialog.getByRole('button', { name: 'Copy sign-in link', exact: true }).click();
    expect(await page.evaluate(() => (window as Window & { copiedText?: string }).copiedText)).toBe(link);
    await expect(dialog.getByRole('link', { name: 'Drag personal sign-in link to bookmarks' })).toHaveAttribute('href', link);
    const downloadPromise = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download key', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('grakata-access-key.txt');
    const contents = await readFile((await download.path())!, 'utf8');
    expect(contents).toContain(key); expect(contents).toContain(link); expect(contents).toContain('BookmarkTenno#123');
    await page.setViewportSize({ width: 320, height: 720 });
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(720);
      await dialog.evaluate(element => { element.scrollTop = 0; });
      await page.screenshot({ path: `test-results/access-key-${theme}-mobile.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await page.screenshot({ path: 'test-results/access-key-desktop.png', fullPage: true });
    await saveKey(page);
    expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toContain(key);
    expect(page.url()).not.toContain(key);
  });

  test('a reusable bookmark signs in without a session and never sends its key in request URLs or referrers', async ({ page, account }) => {
    await openGuest(page);
    const { accessKey, link } = await register(page, 'LinkedTenno#123');
    await page.getByRole('button', { name: 'Browse all weapons', exact: true }).click();
    await page.getByLabel('Search weapons').fill('Boltor');
    await page.getByLabel('Owned: Boltor', { exact: true }).check();
    await account.profile();
    const urls: string[] = [], referrers: string[] = [], logins: string[] = [];
    page.on('request', request => {
      urls.push(request.url()); referrers.push(request.headers().referer ?? '');
      if (request.url().endsWith('/api/account/login')) logins.push(request.postData() ?? '');
    });
    for (let visit = 0; visit < 2; visit++) {
      await signOut(page, 'LinkedTenno#123');
      if (visit === 0) await page.goto('about:blank');
      await page.goto(link);
      await expect(page.getByRole('button', { name: 'Account: LinkedTenno#123', exact: true })).toBeVisible();
      expect((await account.inventory()).items[0]).toMatchObject({ name: 'Boltor', owned: true });
      expect(page.url()).toMatch(/#weapons$/);
      expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toContain(accessKey);
    }
    expect(logins).toHaveLength(2);
    expect(JSON.parse(logins[0])).toMatchObject({ username: 'LinkedTenno#123', accessKey });
    expect(urls.every(url => !url.includes(accessKey))).toBe(true);
    expect(referrers.every(referrer => !referrer.includes(accessKey))).toBe(true);
  });

  test('invalid bookmarks are removed from the address bar and leave sign-in available', async ({ page }) => {
    await page.goto('/#sign-in?username=Tenno&key=incomplete');
    await expect(page.getByRole('alert')).toContainText('incomplete or invalid');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    expect(page.url()).toMatch(/#weapons$/);
    const key = `wft_${'x'.repeat(43)}`;
    await page.goto(accessKeyLink(page.url(), 'UnknownTenno', key));
    await expect(page.getByRole('alert')).toHaveText('Username or access key is incorrect.');
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
    expect(page.url()).not.toContain(key);
  });

  test('replacing a key invalidates its old bookmark and keeps the same saved account', async ({ page, account }) => {
    await openGuest(page);
    const { link: oldLink } = await register(page, 'RotateTenno');
    const previous = await account.session();
    await page.getByRole('button', { name: 'Account: RotateTenno', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Replace access key', exact: true }).click();
    await expect(dialog).toContainText('bookmarked sign-in links will stop working');
    await dialog.getByRole('button', { name: 'Replace key', exact: true }).click();
    const { link } = await saveKey(page);
    expect(link).not.toBe(oldLink);
    expect(await account.session()).toEqual(previous);
    await signOut(page, 'RotateTenno');
    await page.goto(oldLink);
    await expect(page.getByRole('alert')).toHaveText('Username or access key is incorrect.');
    await page.goto(link);
    await expect(page.getByRole('button', { name: 'Account: RotateTenno', exact: true })).toBeVisible();
    expect(await account.session()).toEqual(previous);
  });
});

test('opening another account bookmark in an active tab cannot discard unsaved edits', async ({ page, account, baseURL }) => {
  const response = await fetch(`${account.url}/api/account/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: baseURL!, 'X-Toolkit-Request': '1' }, body: JSON.stringify({ username: 'OtherLinkedTenno' }) });
  expect(response.status).toBe(201);
  const { accessKey } = await response.json();
  await page.goto('/'); await account.profile();
  await page.route('**/api/account/profile', route => route.fulfill({ status: 503, json: { error: 'Save temporarily unavailable.' } }));
  await page.getByLabel('Mastered: Boltor', { exact: true }).uncheck();
  await expect(status(page)).toHaveText('Unsaved changes');
  let logins = 0;
  page.on('request', request => { if (request.url().endsWith('/api/account/login')) logins++; });
  await page.evaluate(hash => { location.hash = hash; }, new URL(accessKeyLink(page.url(), 'OtherLinkedTenno', accessKey)).hash);
  await expect(page.getByRole('alert')).toContainText('Save or download your changes before switching accounts.');
  await expect(page.getByRole('button', { name: 'Account: TestTenno', exact: true })).toBeVisible();
  await expect(page.getByLabel('Mastered: Boltor', { exact: true })).not.toBeChecked();
  expect(logins).toBe(0); expect(page.url()).not.toContain(accessKey);
  expect((await account.session()).user.username).toBe('TestTenno');
});
