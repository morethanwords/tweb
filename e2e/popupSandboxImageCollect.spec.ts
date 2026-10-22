import {expect} from '@playwright/test';
import {test} from './workerContext';
import {preparePopupSandbox} from './popupSandbox.helpers';

/*
 * Chrome never collects an image that was never in the document, loaded, and then lost its src
 * attribute: it shows the broken-image fallback and stays registered with the document for good,
 * with whatever its listeners and properties hold. Such images are everywhere a picture is decoded
 * or drawn off-screen (the chat wallpaper's pattern, blurred thumbnails), and clearing them leaked
 * one per use. jsdom has none of this, so it is checked here, in the browser.
 */

declare global {
  interface Window {
    imageCollected: Record<string, boolean>;
    imageRegistry: FinalizationRegistry<string>;
  }
}

test('an off-screen image cleared after loading can be collected', async({page, browserName}) => {
  test.skip(browserName !== 'chromium', 'the leak is Chrome\'s, and garbage is collected over CDP');
  await preparePopupSandbox(page, false);

  await page.evaluate(async() => {
    const {default: clearMediaElementSource} = await window.e2eImport('/src/helpers/dom/clearMediaElementSource.ts');
    window.imageCollected = {offscreen: false, shown: false};
    window.imageRegistry = new FinalizationRegistry((key) => window.imageCollected[key] = true);
    const url = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>');
    for(const key of ['offscreen', 'shown']) {
      const image = new Image();
      image.src = url;
      await image.decode();
      if(key === 'shown') document.body.append(image);
      clearMediaElementSource(image);
      image.remove();
      window.imageRegistry.register(image, key);
    }
  });

  const cdp = await page.context().newCDPSession(page);
  await expect.poll(async() => {
    await cdp.send('HeapProfiler.collectGarbage');
    return page.evaluate(() => window.imageCollected);
  }).toEqual({offscreen: true, shown: true});
});
