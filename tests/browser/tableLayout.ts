import { expect } from '@playwright/test';
import type { Locator } from '@playwright/test';

export async function expectCenteredTable(region: Locator) {
  await expect.poll(() => region.evaluate(element => {
    const bounds = element.getBoundingClientRect(), parent = element.parentElement!;
    const parentBounds = parent.getBoundingClientRect(), style = getComputedStyle(parent);
    const left = parentBounds.left + parent.clientLeft + parseFloat(style.paddingLeft);
    const width = parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return Math.abs(bounds.left + bounds.width / 2 - left - width / 2);
  })).toBeLessThan(2);
  const layout = await region.evaluate(element => ({
    width: element.clientWidth, scrollWidth: element.scrollWidth,
    tableWidth: element.querySelector('table')!.getBoundingClientRect().width,
  }));
  if (layout.tableWidth > layout.width + 1) expect(layout.scrollWidth).toBeGreaterThan(layout.width);
}
