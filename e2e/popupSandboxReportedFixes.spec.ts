import {expect} from '@playwright/test';
import type {ContactBirthdaysState, MyPromoData} from '@appManagers/appPromoManager';
import {test} from './workerContext';
import {openStory, preparePopupSandbox} from './popupSandbox.helpers';

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
