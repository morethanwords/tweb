import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';

// What a click on an 18+ media asks for, by what the account may do: the age comes first and stops an
// account that may not turn the filter off; past it, such an account still opens one media at a time,
// with no "always show" to remember; one that may turn it off gets the checkbox. The sandbox page is only
// a host with the app's modules and its state.

type Settings = {canChange: boolean, needAgeVerification: boolean, markedVerified?: boolean};

async function clickSensitiveSpoiler(page: Page, settings: Settings) {
  await page.evaluate(async({canChange, needAgeVerification, markedVerified}) => {
    const statePath = '/src/stores/appState.ts';
    const spoilerPath = '/src/components/wrappers/mediaSpoiler.ts';
    const {appState, setAppStateSilent} = await window.e2eImport(statePath);
    const {onMediaSpoilerClick} = await window.e2eImport(spoilerPath);
    setAppStateSilent({
      appConfig: {...JSON.parse(JSON.stringify(appState.appConfig ?? {})), need_age_video_verification: needAgeVerification},
      accountContentSettings: {
        value: {_: 'account.contentSettings', pFlags: canChange ? {sensitive_can_change: true} : {}},
        timestamp: Date.now()
      },
      // * what anyone could write into this device's state: it must not count
      ageVerification: markedVerified ? {date: new Date().toISOString(), layer: 0, clientVersion: ''} : undefined
    });

    const spoiler = document.createElement('div');
    spoiler.className = 'media-spoiler-container';
    spoiler.dataset.isSensitive = 'true';
    spoiler.style.cssText = 'position:absolute;left:0;top:0;width:100px;height:100px;';
    document.body.append(spoiler);
    (window as any).sensitiveSpoiler = spoiler;
    onMediaSpoilerClick({mediaSpoiler: spoiler, event: new MouseEvent('click')});
  }, settings);
}

const isSpoilerShown = (page: Page) => page.evaluate(() => (window as any).sensitiveSpoiler.isConnected as boolean);

test.beforeEach(async({page}) => {
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.getByRole('button', {name: '◂ Hide', exact: true}).click();
});

test('an account that may not turn the filter off opens one media, with nothing to remember', async({page}) => {
  await clickSensitiveSpoiler(page, {canChange: false, needAgeVerification: false});
  const popup = page.locator('.popup-confirmation.active');
  await expect(popup.getByText('18+', {exact: true})).toBeVisible();
  await expect(popup.getByRole('checkbox')).toHaveCount(0);

  await popup.getByRole('button', {name: /view anyway/i}).click();
  await expect.poll(() => isSpoilerShown(page)).toBe(false);
});

test('an account that may turn it off is offered to always show them', async({page}) => {
  await clickSensitiveSpoiler(page, {canChange: true, needAgeVerification: false});
  const popup = page.locator('.popup-confirmation.active');
  await expect(popup.getByRole('checkbox', {name: 'Always show 18+ media'})).toBeVisible();
});

test('an unverified age stops an account that may not turn the filter off', async({page}) => {
  await clickSensitiveSpoiler(page, {canChange: false, needAgeVerification: true});
  await expect(page.locator('.toast').getByText(/not available in your country/)).toBeVisible();
  await expect(page.locator('.popup.active')).toHaveCount(0);
  expect(await isSpoilerShown(page)).toBe(true);
});

test('an unverified age is asked for first from an account that may turn it off', async({page}) => {
  await clickSensitiveSpoiler(page, {canChange: true, needAgeVerification: true});
  await expect(page.locator('.popup.active').getByText('Age Verification', {exact: true})).toBeVisible();
  await expect(page.locator('.popup-confirmation.active')).toHaveCount(0);
});

test('a verified age marked only on this device counts for nothing', async({page}) => {
  await clickSensitiveSpoiler(page, {canChange: false, needAgeVerification: true, markedVerified: true});
  await expect(page.locator('.toast').getByText(/not available in your country/)).toBeVisible();
  await expect(page.locator('.popup.active')).toHaveCount(0);
  expect(await isSpoilerShown(page)).toBe(true);
});
