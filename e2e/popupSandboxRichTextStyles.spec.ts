import {expect} from '@playwright/test';
import {test} from './workerContext';

for(const options of [
  {fontSize: 16, width: 400, rtl: false, legacyHeadings: false},
  {fontSize: 20, width: 280, rtl: true, legacyHeadings: true}
]) test(`Instant View and rich messages use the editor content styles ${JSON.stringify(options)}`, async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if(message.type() === 'error' && message.text().startsWith('solid error')) errors.push(message.text());
  });
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.getByRole('button', {name: '◂ Hide', exact: true}).click();
  const selectors = await page.evaluate(async options => {
    const path = '/e2e/fixtures/richTextStyles.ts';
    const {mountRichTextStyles} = await import(/* @vite-ignore */ path);
    return mountRichTextStyles(options).selectors as Record<string, string>;
  }, options);
  await expect.poll(() => page.evaluate(() => [...document.fonts]
  .filter(font => font.status === 'loading')
  .map(font => font.family))).toEqual([]);
  await expect(page.locator('[data-rich-text-surface="message"] .code-code')).toHaveText('const value = 1;');
  const snapshots = await page.evaluate(selectors => {
    const properties = [
      'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'color',
      'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
      'margin-top', 'margin-bottom', 'border-radius', 'border-top-width', 'border-top-color',
      'text-align', 'background-color'
    ];
    return Object.fromEntries(['editor', 'instant-view', 'message'].map(surface => {
      const root = document.querySelector(`[data-rich-text-surface="${surface}"]`)!;
      return [surface, Object.fromEntries(Object.entries(selectors).map(([name, selector]) => {
        const element = root.querySelector(selector);
        if(!element) return [name, null];
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return [name, {
          styles: Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)])),
          width: bounds.width,
          height: bounds.height
        }];
      }))];
    }));
  }, selectors);
  await page.screenshot({path: test.info().outputPath('shared-rich-text-styles.png'), fullPage: true});
  expect(errors).toEqual([]);
  for(const surface of ['instant-view', 'message']) for(const name of Object.keys(selectors)) {
    expect.soft(snapshots.editor[name], `editor: ${name}`).not.toBeNull();
    expect.soft(snapshots[surface][name], `${surface}: ${name}`).not.toBeNull();
    expect.soft(snapshots[surface][name]?.styles, `${surface}: ${name}`).toEqual(snapshots.editor[name]?.styles);
    expect.soft(snapshots[surface][name]?.width, `${surface}: ${name} width`).toBeCloseTo(snapshots.editor[name]?.width, 0);
    expect.soft(snapshots[surface][name]?.height, `${surface}: ${name} height`).toBeCloseTo(snapshots.editor[name]?.height, 0);
  }
});

test('Roboto Serif retains language ranges in compiled CSS and loads Cyrillic', async({page}) => {
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  const result = await page.evaluate(async() => {
    const faces = [...document.fonts].filter(font => font.family.replace(/"/g, '') === 'Roboto Serif');
    await document.fonts.load('400 24px "Roboto Serif"', 'Привет');
    return {ranges: faces.map(font => font.unicodeRange), loaded: faces.filter(font => font.status === 'loaded').map(font => font.unicodeRange)};
  });
  expect(result.ranges).toHaveLength(18);
  expect(result.ranges).not.toContain('U+0-10FFFF');
  expect(result.loaded.some(range => /U\+0?400-0?45F/i.test(range))).toBe(true);
});
