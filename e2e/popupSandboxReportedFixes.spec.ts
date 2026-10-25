import {expect} from '@playwright/test';
import type {ContactBirthdaysState, MyPromoData} from '@appManagers/appPromoManager';
import {test} from './workerContext';
import {openMediaEditor, openStory, preparePopupSandbox} from './popupSandbox.helpers';

for(const dir of ['ltr', 'rtl'] as const) {
  test(`selling a gift waits for confirmation and survives cancellation (${dir})`, async({page}) => {
    await page.clock.install({time: new Date('2024-06-02T00:00:00Z')});
    await preparePopupSandbox(page, false, {a11y: true});
    await page.evaluate((dir) => window.popupSandbox.setDirection(dir), dir);
    expect(await openStory(page, 'gift/info-plain')).toBeNull();
    await page.evaluate(async() => {
      const {getMockManagers} = await window.e2eImport('/src/components/popupSandbox/environment.ts');
      getMockManagers().override({appGiftsManager: {convertGift: () => true}});
    });

    const gift = page.locator('.popup-star-gift-info.active');
    const sell = gift.getByRole('button', {name: /sell for 400 Stars/i});
    const conversions = () => page.evaluate(() => window.popupSandbox.calls().filter(({manager, method}) => (
      manager === 'appGiftsManager' && method === 'convertGift'
    )).length);
    const confirmation = page.locator('.popup-confirmation.active');

    await sell.focus();
    await page.keyboard.press('Enter');
    await expect(confirmation).toContainText('sell this gift for 400 Stars');
    expect(await conversions()).toBe(0);
    await confirmation.getByRole('button', {name: 'Cancel', exact: true}).click();
    await expect(confirmation).toHaveCount(0);
    await expect(sell).toBeEnabled();
    expect(await conversions()).toBe(0);

    await sell.click();
    await expect(confirmation).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(confirmation).toHaveCount(0);
    await expect(sell).toBeEnabled();
    expect(await conversions()).toBe(0);

    await sell.click();
    await confirmation.getByRole('button', {name: /sell for 400 Stars/i}).click();
    await expect.poll(conversions).toBe(1);
    await expect(gift).toHaveCount(0);
  });

  test(`a reply to a story keeps its subtitle (${dir})`, async({page}) => {
    await preparePopupSandbox(page, false);
    await page.evaluate(async(dir) => {
      window.popupSandbox.setDirection(dir);
      const {default: wrapReply} = await window.e2eImport('/src/components/wrappers/reply.ts');
      const {container, fillPromise} = wrapReply({
        title: 'Story author',
        storyItem: {
          _: 'storyItem',
          pFlags: {},
          id: 1,
          date: 1,
          expire_date: 2,
          media: {_: 'messageMediaUnsupported'}
        }
      });
      document.body.append(container);
      await fillPromise;
    }, dir);
    await expect(page.locator('.reply-title')).toHaveText('Story author');
    await expect(page.locator('.reply-subtitle')).toBeVisible();
    await expect(page.locator('.reply-subtitle')).toHaveText('Story');
  });
}

test('returning to the tab on a new day expires yesterday\'s birthday suggestion', async({page}) => {
  await preparePopupSandbox(page, false);
  const today = new Date(2026, 9, 25, 12);
  await page.clock.install({time: today});
  await page.evaluate(async() => {
    const {getMockManagers} = await window.e2eImport('/src/components/popupSandbox/environment.ts');
    const {CONTACT_USER_ID} = await window.e2eImport('/src/components/popupSandbox/fixtures.ts');
    const firstDay = new Date().toDateString();
    getMockManagers().override({appPromoManager: {
      getPromoData: (): MyPromoData => ({pendingSuggestions: [], dismissedSuggestions: []}),
      getContactBirthdays: (): ContactBirthdaysState => {
        const today: ContactBirthdaysState['today'] = new Date().toDateString() === firstDay ? [{
          peerId: CONTACT_USER_ID.toPeerId(),
          birthday: {_: 'birthday', day: 25, month: 10}
        }] : [];
        return {contacts: today, today, yesterday: [], tomorrow: []};
      }
    }});
    const {default: createBirthdaySuggestions} = await window.e2eImport('/src/components/sidebarLeft/birthdaySuggestions.tsx');
    const {wrapSolidComponent} = await window.e2eImport('/src/helpers/solid/wrapSolidComponent.ts');
    const {getMiddleware} = await window.e2eImport('/src/helpers/middleware.ts');
    wrapSolidComponent(() => {
      (window as any).birthdaySuggestionsTest = createBirthdaySuggestions();
      return document.createElement('div');
    }, getMiddleware().get());
  });
  await expect.poll(() => page.evaluate(() => (window as any).birthdaySuggestionsTest.contacts.available())).toBe(true);

  await page.clock.setSystemTime(new Date(2026, 9, 26, 12));
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => (window as any).birthdaySuggestionsTest.contacts.available())).toBe(false);
  expect(await page.evaluate(() => window.popupSandbox.calls().filter(({manager, method, args}) => (
    manager === 'appPromoManager' && method === 'getContactBirthdays' && args[0] === true
  )).length)).toBe(1);
});

// a display name is whatever its owner typed
const MARKUP_TITLE = '<img src=x onerror="window.copiedMarkupRan = true">';

test('an admin log copy holds the actor\'s name as text', async({page}) => {
  await preparePopupSandbox(page, false);
  const copied = await page.evaluate(async(title) => {
    const {hotReloadGuard} = await window.e2eImport('/src/lib/solidjs/hotReloadGuardProvider.tsx');
    const {runWithHotReloadGuard} = await window.e2eImport('/src/lib/solidjs/runWithHotReloadGuard.tsx');
    const {createMessageCopyText, createMessageWithPreviousCopyText} = await window.e2eImport('/src/components/chat/bubbleParts/adminLogsResolver/copyTextHelpers.ts');
    const message = (text: string) => ({_: 'message', id: 1, date: 0, message: text, pFlags: {}});
    const {getPeerTitle} = hotReloadGuard;
    hotReloadGuard.getPeerTitle = async() => title;
    try {
      const results = [
        await runWithHotReloadGuard(() => createMessageCopyText(0, 1, message('Deleted'), (peerTitle: string) => `${peerTitle} deleted`)),
        await runWithHotReloadGuard(() => createMessageWithPreviousCopyText(
          0, 1, message('New'), message('Old'), (peerTitle: string) => `${peerTitle} edited`, () => 'Original'
        ))
      ];

      return results.map(({text, html}: {text: string, html: string}) => {
        const template = document.createElement('template');
        template.innerHTML = html;
        return {text, images: template.content.querySelectorAll('img').length, content: template.content.textContent};
      });
    } finally {
      hotReloadGuard.getPeerTitle = getPeerTitle;
    }
  }, MARKUP_TITLE);

  expect(copied[0].text).toMatch(/\nDeleted$/);
  expect(copied[0].text.startsWith(`${MARKUP_TITLE} deleted [`)).toBe(true);
  expect(copied[0].content).toContain(`${MARKUP_TITLE} deleted [`);
  expect(copied[1].text).toMatch(/\nNew\n\nOriginal:\nOld$/);
  expect(copied[1].content).toContain(`${MARKUP_TITLE} edited [`);
  for(const {images} of copied) {
    expect(images).toBe(0);
  }
});

// a dialog's focus trap (the Translate or AI editor popup, with the keyboard layer) takes the focus
// back from whatever takes it outside the dialog
for(const trapped of [false, true]) test(`a copy the clipboard API refuses puts its HTML on the clipboard without rendering it${trapped ? ' (in a focus trap)' : ''}`, async({page, browserName}) => {
  await preparePopupSandbox(page, false, {a11y: trapped});
  if(browserName === 'chromium') {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  }

  const html = `<b>Copied</b> text${MARKUP_TITLE}`;
  const copied = await page.evaluate(async({html, trapped}) => {
    const {copyTextToClipboard} = await window.e2eImport('/src/helpers/clipboard.ts');
    const {default: createFocusTrap} = await window.e2eImport('/src/helpers/dom/focusTrap.ts');
    const dialog = document.createElement('div');
    dialog.append(document.createElement('button'));
    document.body.append(dialog);
    const trap = createFocusTrap(dialog);
    if(trapped) trap.activate();
    // as a browser without ClipboardItem writing, or one the site may not write the clipboard in
    Object.defineProperty(navigator.clipboard, 'write', {
      configurable: true,
      value: () => Promise.reject(new DOMException('Write permission denied.', 'NotAllowedError'))
    });

    const added: string[] = [];
    const observer = new MutationObserver((records) => {
      records.forEach(({addedNodes}) => addedNodes.forEach((node) => added.push(node.nodeName)));
    });
    const copies: {text: string, html: string}[] = [];
    const onCopy = (e: ClipboardEvent) => copies.push({
      text: e.clipboardData.getData('text/plain'),
      html: e.clipboardData.getData('text/html')
    });
    observer.observe(document.body, {childList: true, subtree: true});
    document.addEventListener('copy', onCopy);
    let focusedBack: boolean;
    try {
      await copyTextToClipboard('Copied text', html);
      focusedBack = document.activeElement === dialog.firstElementChild;
    } finally {
      observer.disconnect();
      document.removeEventListener('copy', onCopy);
      trap.deactivate(false);
      dialog.remove();
    }

    return {added, copies, focusedBack};
  }, {html, trapped});

  // the text it was copied from is all the document saw of it
  expect(copied.added).toEqual(['TEXTAREA']);
  expect(copied.copies).toEqual([{text: 'Copied text', html}]);
  // the dialog's control the copy was asked from keeps the focus
  if(trapped) expect(copied.focusedBack).toBe(true);
  expect(await page.evaluate(() => (window as any).copiedMarkupRan)).toBeUndefined();

  if(browserName === 'chromium') {
    const clipboard = await page.evaluate(async() => {
      const [item] = await navigator.clipboard.read();
      return {
        text: await (await item.getType('text/plain')).text(),
        html: await (await item.getType('text/html')).text()
      };
    });
    expect(clipboard.text).toBe('Copied text');
    // what the browser reads back is sanitized: the formatting is there, the handler is not
    expect(clipboard.html).toContain('<b>Copied</b> text');
  }
});

test('a media editor text layer outlines its text as text', async({page}) => {
  test.setTimeout(120_000);
  const editor = await openMediaEditor(page);
  await editor.getByRole('tab', {name: 'Text', exact: true}).click();
  // the surface lies under the canvas, which takes the pointer in Firefox: the keyboard reaches it
  await editor.getByRole('button', {name: 'Add text layer', exact: true}).press('Enter');
  const outlined = editor.getByRole('button', {name: 'Outlined text', exact: true});
  await outlined.press('Enter');
  await expect(outlined).toHaveAttribute('aria-pressed', 'true');
  await editor.getByRole('textbox', {name: 'Type something...', exact: true}).fill(MARKUP_TITLE);

  const layer = editor.locator('.media-editor__resizable-container');
  await expect(layer.locator('.media-editor__text-layer-svg-outline text')).toHaveText(MARKUP_TITLE);
  await expect(layer.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).copiedMarkupRan)).toBeUndefined();
});
