import {createRequire} from 'node:module';
import {test, expect} from './isolation';

// Use the image comparator shipped by our exact Playwright pin, without another
// runtime dependency or a candidate-generated golden image.
const requireTest = createRequire(import.meta.url);
const requirePlaywright = createRequire(requireTest.resolve('@playwright/test'));
const requireCore = createRequire(requirePlaywright.resolve('playwright'));
const {utils} = requireCore('playwright-core/lib/coreBundle') as {
  utils: {getComparator: (mime: string) => (actual: Buffer, expected: Buffer, options: object) => {errorMessage: string; diff?: Buffer} | null};
};
test.use({artifact: 'reference'});

for (const theme of ['day', 'night']) {
  test(`native bubbles, rows, hover and typing match frozen upstream: ${theme}`, async ({page}, info) => {
    await page.goto(`http://127.0.0.1:3123/?theme=${theme}`);
    await page.evaluate(() => document.fonts.ready);
    const fixture = page.locator('.visual-fixture');
    await expect(fixture).toBeVisible();
    const capture = async () => {
      const bounds = await fixture.boundingBox();
      const viewport = page.viewportSize();
      if (!bounds || !viewport) throw new Error('Missing visual fixture bounds.');
      // The upstream app clips its body. WebKit paints black outside a short
      // viewport when element.screenshot expands beyond it. Compare the actual
      // visible region; larger viewport projects cover the complete fixture.
      const x = Math.max(0, bounds.x), y = Math.max(0, bounds.y);
      return page.screenshot({animations: 'disabled', clip: {
        x, y, width: Math.min(bounds.x + bounds.width, viewport.width) - x,
        height: Math.min(bounds.y + bounds.height, viewport.height) - y
      }});
    };
    await page.mouse.move(0, 0);
    const expected = await capture();
    await page.locator('.reply-markup-button[data-button-id="material"]').first().hover();
    const expectedHover = await capture();
    await page.goto(`http://127.0.0.1:3123/candidate.html?theme=${theme}`);
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(0, 0);
    const actual = await capture();
    await page.locator('.reply-markup-button[data-button-id="material"]').first().hover();
    const actualHover = await capture();
    for (const [name, before, after] of [['rest', expected, actual], ['hover', expectedHover, actualHover]] as const) {
      const comparison = utils.getComparator('image/png')(after, before, {threshold: 0.15, maxDiffPixels: 120, maxDiffPixelRatio: 0.001});
      await info.attach(`${theme}-${name}-upstream`, {body: before, contentType: 'image/png'});
      await info.attach(`${theme}-${name}-candidate`, {body: after, contentType: 'image/png'});
      if (comparison?.diff) await info.attach(`${theme}-${name}-diff`, {body: comparison.diff, contentType: 'image/png'});
      expect(comparison?.errorMessage, 'candidate must match independent upstream renderer').toBeUndefined();
    }
  });
}
