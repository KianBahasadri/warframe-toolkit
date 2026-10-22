import { test, expect } from './accountFixture';
import { routeMeta } from '../../src/lib/seo';

test('tool paths keep the same screens and publish a separate title for each one', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/weapons$/);
  await expect(page).toHaveTitle(routeMeta.weapons.title);
  await expect(page.getByRole('region', { name: 'Weapons', exact: true })).toBeVisible();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', routeMeta.weapons.description);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://grakata.com/weapons');

  await page.goto('/#relics');
  await expect(page).toHaveURL(/\/relics$/);
  await expect(page).toHaveTitle(routeMeta.relics.title);
  await expect(page.getByRole('region', { name: 'Relics', exact: true })).toBeVisible();
  await expect(page.locator('h1, h2, p').filter({ hasText: routeMeta.relics.description })).toHaveCount(0);

  await page.getByRole('link', { name: 'Drop Tables', exact: true }).click();
  await expect(page).toHaveURL(/\/droptables(?:\?|$)/);
  await expect(page).toHaveTitle(routeMeta.droptables.title);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://grakata.com/droptables');
  await expect(page.getByRole('region', { name: 'Drop Tables', exact: true })).toBeVisible();
});
