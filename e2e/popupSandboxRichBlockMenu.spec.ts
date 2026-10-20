import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';

// The rich editor's "+" menu: outline icons, as on every other item of it, and one premium star on
// every item a rich message alone can carry, the same on each — on Heading too, which opens a submenu.

async function openPlusMenu(page: Page) {
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.getByRole('button', {name: '◂ Hide', exact: true}).click();
  await page.evaluate(async() => {
    const path = '/e2e/fixtures/richMediaComposer.ts';
    const {mountRichMediaComposerHarness} = await window.e2eImport(path);
    mountRichMediaComposerHarness({premiumRequired: true});
  });
  await page.getByRole('button', {name: 'More actions', exact: true}).click();
  const menu = page.getByRole('menu').filter({has: page.getByRole('menuitem', {name: 'Body text'})});
  await expect(menu).toBeVisible();
  return menu;
}

test('Quote in the block menu has the outline quote icon', async({page}) => {
  const menu = await openPlusMenu(page);
  const glyphs = await page.evaluate(async() => {
    const path = '/src/icons.ts';
    const {default: icons} = await window.e2eImport(path);
    return {quote: String.fromCharCode(parseInt(icons.quote, 16)), filled: String.fromCharCode(parseInt(icons.quote_filled, 16))};
  });
  const icon = menu.getByRole('menuitem', {name: 'Quote', exact: true}).locator('.btn-menu-item-icon');
  await expect(icon).toHaveText(glyphs.quote);
  await expect(icon).not.toHaveText(glyphs.filled);
});

test('the premium star on Heading looks as on every other item of the block menu', async({page}) => {
  const menu = await openPlusMenu(page);
  const stars = menu.locator('.message-input-editor-premium-star:not([hidden])');
  await expect.poll(() => stars.count()).toBeGreaterThan(1);
  // the menu's opening animation scales it: measured at rest
  await expect.poll(() => menu.evaluate((element) => element.getAnimations({subtree: true}).length)).toBe(0);
  const measured = await stars.evaluateAll((elements) => elements.map((star) => {
    const style = getComputedStyle(star);
    const label = star.parentElement;
    const range = document.createRange();
    range.selectNodeContents(label);
    range.setEndBefore(star);
    const text = range.getBoundingClientRect();
    const bounds = star.getBoundingClientRect();
    return {
      item: label.textContent.replace(star.textContent, '').trim(),
      style: Object.fromEntries(['font-size', 'color', 'transform', 'vertical-align', 'margin-inline-start']
      .map((property) => [property, style.getPropertyValue(property)])),
      width: bounds.width,
      height: bounds.height,
      // where it stands against its label's text
      gap: bounds.left - text.right,
      top: bounds.top - text.top
    };
  }));
  const heading = measured.find(({item}) => item === 'Heading');
  const footer = measured.find(({item}) => item === 'Footer');
  expect(heading, 'Heading has a star').toBeTruthy();
  expect(footer, 'Footer has a star').toBeTruthy();
  for(const star of measured) {
    expect.soft(star.style, star.item).toEqual(footer.style);
    expect.soft(star.width, `${star.item} width`).toBeCloseTo(footer.width, 1);
    expect.soft(star.height, `${star.item} height`).toBeCloseTo(footer.height, 1);
    expect.soft(star.gap, `${star.item} gap`).toBeCloseTo(footer.gap, 0);
    expect.soft(star.top, `${star.item} top`).toBeCloseTo(footer.top, 0);
  }
  expect(footer.gap, 'the star keeps off the text').toBeGreaterThan(0);
});
