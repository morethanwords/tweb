import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';
import type {AiPopupHarness} from './fixtures/aiEditorPopup';

declare global {
  interface Window {
    aiPopupHarness: AiPopupHarness
  }
}

async function open(page: Page, options: {rich: boolean, create?: boolean, scheduled?: boolean}) {
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.evaluate(async(options) => {
    const path = '/e2e/fixtures/aiEditorPopup.ts';
    const {openAiPopupHarness} = await import(/* @vite-ignore */ path);
    window.aiPopupHarness = openAiPopupHarness(options);
  }, options);
  const popup = page.locator('.popup.active').last();
  await expect(popup).toBeVisible();
  if(!options.create) await popup.getByRole('button', {name: 'Prompt', exact: true}).press('Enter');
  await popup.getByRole('textbox').fill('Make this clear');
  await popup.getByRole('button', {name: 'Generate', exact: true}).click();
  await expect(popup.getByText('Generated text', {exact: true})).toBeVisible();
  expect((await page.evaluate(() => window.aiPopupHarness.state())).generations).toBe(1);
  if(options.rich) await expect(popup.getByRole('heading', {name: 'Generated heading'})).toBeVisible();
  return popup;
}

for(const rich of [false, true]) for(const action of ['Apply', 'Send', 'Create'] as const) {
  test(`${action} ${rich ? 'rich' : 'plain'} result survives refusal and closes only after success`, async({page}) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    const popup = await open(page, {rich, create: action === 'Create'});
    if(rich && action === 'Apply') {
      await popup.evaluate(element => Promise.all(element.getAnimations({subtree: true})
      .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
      .map(animation => animation.finished.catch(() => {}))));
      await page.screenshot({path: test.info().outputPath('generated-rich.png')});
    }
    const selector = action === 'Create' ? /Add to Message/i : action;
    const button = popup.getByRole('button', {name: selector, exact: action !== 'Create'});
    await button.click();
    await expect(button).toBeDisabled();
    await expect(popup).toBeVisible();
    await page.evaluate(() => window.aiPopupHarness.finish(false));
    await expect(button).toBeEnabled();
    await expect(popup.getByText('Generated text', {exact: true})).toBeVisible();
    await button.click();
    await page.evaluate(() => window.aiPopupHarness.finish(true));
    await expect(page.locator('.popup.active')).toHaveCount(0);
    const state = await page.evaluate(() => window.aiPopupHarness.state());
    expect(state.calls).toHaveLength(2);
    expect(state.calls[0]).toEqual(state.calls[1]);
    expect(state.calls[0].action).toBe(`${action === 'Send' ? 'send' : 'apply'}${rich ? '-rich' : ''}`);
    expect(state.calls[0].value).toMatchObject(rich ? {_: 'richMessage', blocks: expect.any(Array)} : {
      text: 'Generated text', entities: [{_: 'messageEntityBold', offset: 0, length: 9}]
    });
    expect(errors).toEqual([]);
  });
}

test('send failure keeps the generated result available for retry', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const popup = await open(page, {rich: true});
  const send = popup.getByRole('button', {name: 'Send', exact: true});
  await send.click();
  await page.evaluate(() => window.aiPopupHarness.finish('error'));
  await expect(send).toBeEnabled();
  await expect(popup.getByText('Generated text', {exact: true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('closing during send does not reopen the popup or report a late error', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const popup = await open(page, {rich: false});
  await popup.getByRole('button', {name: 'Send', exact: true}).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.popup.active')).toHaveCount(0);
  await page.evaluate(() => window.aiPopupHarness.finish('error'));
  await expect(page.locator('.popup.active')).toHaveCount(0);
  expect((await page.evaluate(() => window.aiPopupHarness.state())).calls).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('keyboard tab switching keeps the prompt and regenerates the current result', async({page}) => {
  const popup = await open(page, {rich: true});
  await popup.getByRole('button', {name: 'Fix', exact: true}).press('Space');
  await expect.poll(async() => (await page.evaluate(() => window.aiPopupHarness.state())).generations).toBe(2);
  await expect(popup.getByText('Generated text', {exact: true})).toBeVisible();
  await popup.getByRole('button', {name: 'Style', exact: true}).press('Enter');
  const prompt = popup.getByRole('button', {name: 'Prompt', exact: true});
  await expect(prompt).toHaveCount(1);
  await prompt.press('Enter');
  await expect(popup.getByRole('textbox')).toHaveText('Make this clear');
  await popup.getByRole('button', {name: 'Generate', exact: true}).click();
  await expect.poll(async() => (await page.evaluate(() => window.aiPopupHarness.state())).generations).toBe(3);
  await expect(popup.getByText('Generated text', {exact: true})).toBeVisible();
});

for(const closeBeforeOnline of [false, true]) test(`scheduled AI send respects popup closure=${closeBeforeOnline} and silent toggle`, async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const popup = await open(page, {rich: true, scheduled: true});
  const send = popup.getByRole('button', {name: 'Send', exact: true});
  await send.click();
  await expect(send).toBeDisabled();
  expect((await page.evaluate(() => window.aiPopupHarness.state())).onlineRequests).toBe(1);
  if(closeBeforeOnline) await page.keyboard.press('Escape');
  await page.evaluate(() => window.aiPopupHarness.finishOnline());
  const picker = page.locator('.popup-date-picker.active');
  if(closeBeforeOnline) {
    await expect(page.locator('.popup.active')).toHaveCount(0);
    expect((await page.evaluate(() => window.aiPopupHarness.state())).calls).toEqual([]);
  } else {
    await expect(picker).toBeVisible();
    await picker.locator('.date-picker-silent').click();
    await picker.locator('.popup-footer button').first().click();
    await expect(picker).toHaveCount(0);
    await expect(send).toBeDisabled();
    const {calls} = await page.evaluate(() => window.aiPopupHarness.state());
    expect(calls).toHaveLength(1);
    expect(calls[0].options).toMatchObject({silent: true, scheduleDate: expect.any(Number)});
    await page.evaluate(() => window.aiPopupHarness.finish(true));
    await expect(page.locator('.popup.active')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
