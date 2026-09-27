import {expect} from '@playwright/test';
import {test} from './workerContext';
import type {ChatInputMapOptions} from '@components/chat/inputEditor/types';

declare global {
  interface Window {
    mapPickerResult: ChatInputMapOptions | 'cancelled'
  }
}

for(const action of ['preserve', 'edit', 'cancel'] as const) test(`map picker ${action} preserves the selected content contract`, async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.evaluate(async() => {
    const path = '/src/components/popups/richMessageLocation.tsx';
    const {default: showPicker} = await import(/* @vite-ignore */ path);
    void showPicker({editing: true, map: {
      latitude: 20, longitude: 0, zoom: 2, width: 400, height: 200,
      accuracyRadius: 50, caption: 'Original place\nOriginal address',
      captionEntities: [{_: 'messageEntityBold', offset: 0, length: 14}]
    }}).then((result: ChatInputMapOptions) => window.mapPickerResult = result, () => window.mapPickerResult = 'cancelled');
  });
  const popup = page.locator('.popup-rich-map.active');
  await expect(popup).toBeVisible();
  if(action === 'cancel') {
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.mapPickerResult)).toBe('cancelled');
  } else {
    if(action === 'edit') {
      await popup.getByRole('textbox', {name: 'Title', exact: true}).fill('New place');
      await popup.getByRole('textbox', {name: 'Address', exact: true}).fill('New address');
      const map = popup.locator('.popup-rich-map-preview');
      await map.press('ArrowRight');
      await map.press('+');
      const box = (await map.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, {steps: 4});
      await page.mouse.up();
    }
    await popup.getByRole('button', {name: 'Save', exact: true}).click();
    await expect.poll(() => page.evaluate(() => window.mapPickerResult)).toBeTruthy();
    const result = await page.evaluate(() => window.mapPickerResult) as ChatInputMapOptions;
    expect(result).toMatchObject({width: 400, height: 200});
    if(action === 'preserve') {
      expect(result).toMatchObject({
        latitude: 20, longitude: 0, zoom: 2, accuracyRadius: 50,
        caption: 'Original place\nOriginal address',
        captionEntities: [{_: 'messageEntityBold', offset: 0, length: 14}]
      });
    } else {
      expect(result).toMatchObject({zoom: 3, caption: 'New place\nNew address', captionEntities: []});
      expect(result.accuracyRadius).toBeUndefined();
      expect(result.latitude).not.toBe(20);
      expect(result.longitude).not.toBe(0);
    }
  }
  await expect(popup).toHaveCount(0);
  expect(errors).toEqual([]);
});
