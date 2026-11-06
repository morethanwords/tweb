import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';
import type {AiPopupHarness, openAiPopupHarness} from './fixtures/aiEditorPopup';

type AiPopupHarnessOpener = typeof openAiPopupHarness;

declare global {
  interface Window {
    aiPopupHarness: AiPopupHarness
  }
}

async function openHarness(page: Page, options: Parameters<AiPopupHarnessOpener>[0]) {
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.evaluate(async(options) => {
    const path = '/e2e/fixtures/aiEditorPopup.ts';
    const {openAiPopupHarness} = await window.e2eImport(path);
    window.aiPopupHarness = openAiPopupHarness(options);
  }, options);
  const popup = page.locator('.popup.active').last();
  await expect(popup).toBeVisible();
  return popup;
}

async function open(page: Page, options: Parameters<AiPopupHarnessOpener>[0]) {
  const popup = await openHarness(page, options);
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

// * what the chat was given to keep, in order
const kept = async(page: Page) => (await page.evaluate(() => window.aiPopupHarness.state())).calls
.filter(({action}) => action === 'save-style')
.map(({value}) => value);

test('Always use in this chat keeps what the editor asks for, follows it while on, and never closes the popup', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const popup = await open(page, {rich: false, sendStyle: {}});
  const alwaysUse = popup.getByRole('checkbox', {name: /Always use in this chat/});
  // * what it would keep is said under it, on or off
  await expect(alwaysUse).not.toBeChecked();
  await expect(popup.getByText('→ «Make this clear»', {exact: true})).toBeVisible();

  await popup.locator('.row', {hasText: 'Always use in this chat'}).click();
  await expect(alwaysUse).toBeChecked();
  expect(await kept(page)).toEqual([{customPrompt: 'Make this clear'}]);

  // * a prompt being typed is no change: the one applied is kept
  await popup.getByRole('textbox').fill('Make this shorter');
  await expect(popup.getByText('→ «Make this clear»', {exact: true})).toBeVisible();
  // * another tab is kept at once, with its result yet to come
  await popup.getByRole('button', {name: 'Fix', exact: true}).click();
  await expect(popup.getByText('→ Fix grammar', {exact: true})).toBeVisible();
  expect(await kept(page)).toEqual([{customPrompt: 'Make this clear'}, {proofRead: true}]);

  await alwaysUse.press('Space');
  await expect(alwaysUse).not.toBeChecked();
  // * off, the editor is no longer followed
  await popup.getByRole('button', {name: 'Translate', exact: true}).click();
  // * once the one it replaces has faded
  await expect(popup.getByText(/^→ /)).toHaveCount(1);
  await expect(popup.getByText(/^→ /)).toBeVisible();
  expect(await kept(page)).toEqual([{customPrompt: 'Make this clear'}, {proofRead: true}, undefined]);
  await expect(popup).toBeVisible();
  await expect(page.locator('.toast.is-visible')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('opened with a kept request, it is on and the popup shows it made; what it cannot show stays kept', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let popup = await openHarness(page, {rich: false, sendStyle: {saved: {proofRead: true}}});
  await expect(popup.getByRole('button', {name: 'Fix', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await expect(popup.getByText('Generated text', {exact: true})).toBeVisible();
  await expect(popup.getByRole('checkbox', {name: /Always use in this chat/})).toBeChecked();
  expect(await kept(page)).toEqual([]);

  // * a style gone from the list since: the tab opens on nothing, and the chat keeps the style
  popup = await openHarness(page, {rich: false, tones: 2, sendStyle: {saved: {toneNameOrId: 'gone', toneTitle: 'Gone'}}});
  await expect(popup.getByRole('button', {name: 'Style 1', exact: true})).toBeVisible();
  await expect(popup.getByRole('checkbox', {name: /Always use in this chat/})).toBeChecked();
  await expect(popup.getByText(/^→ /)).toHaveCount(0);
  expect(await kept(page)).toEqual([]);
  // * a choice made then is kept
  await popup.getByRole('button', {name: 'Style 1', exact: true}).click();
  await expect(popup.getByText('→ Style 1', {exact: true})).toBeVisible();
  expect(await kept(page)).toEqual([{toneNameOrId: 'tone1', toneTitle: 'Style 1'}]);
  expect(errors).toEqual([]);
});

test('a chat that cannot keep the request leaves the switch off', async({page}) => {
  const popup = await open(page, {rich: false, sendStyle: {refuse: true}});
  const alwaysUse = popup.getByRole('checkbox', {name: /Always use in this chat/});
  await popup.locator('.row', {hasText: 'Always use in this chat'}).click();
  expect(await kept(page)).toEqual([{customPrompt: 'Make this clear'}]);
  await expect(alwaysUse).not.toBeChecked();
});

// * frame by frame after a click on the button named so (in the page, so that no frame goes unseen): where the
// * "Always use" row's title stands in it, how tall its card is, and its subtitles (a leaving copy is aria-hidden)
const traceAlwaysUse = (page: Page, buttonName: string) => page.evaluate(async(buttonName) => {
  const popup = document.querySelector('.popup.active');
  const row = [...popup.querySelectorAll<HTMLElement>('.row')].find((row) => row.textContent.includes('Always use in this chat'));
  const card = row.closest('.sidebar-left-section');
  const record = () => {
    const rowTop = row.getBoundingClientRect().top;
    return {
      title: row.querySelector('.row-title:not(.row-title-right)').getBoundingClientRect().top - rowTop,
      card: card.getBoundingClientRect().height,
      subtitles: [...row.querySelectorAll('.row-subtitle:not(.row-subtitle-right)')].map((subtitle) => ({
        opacity: +getComputedStyle(subtitle).opacity,
        leaving: subtitle.getAttribute('aria-hidden') === 'true'
      }))
    };
  };

  // * the popup's own transitions over first
  await Promise.all(document.getAnimations()
  .filter((animation) => animation.effect.getTiming().iterations !== Infinity)
  .map((animation) => animation.finished.catch(() => {})));
  const frames = [record()];
  [...popup.querySelectorAll<HTMLElement>('button')].find((button) => button.textContent.trim() === buttonName).click();
  for(const start = performance.now(); performance.now() - start < 450;) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    frames.push(record());
  }
  return frames;
}, buttonName);

test('the lines of "Always use in this chat" part as a summary comes under the title and close up as it goes', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const popup = await openHarness(page, {rich: false, tones: 2, sendStyle: {}});
  await expect(popup.getByRole('button', {name: 'Style 1', exact: true})).toBeVisible();
  await expect(popup.getByText(/^→ /)).toHaveCount(0);
  // * between where it was and where it goes, not at either
  const between = (value: number, from: number, to: number) => Math.min(from, to) + .25 < value && value < Math.max(from, to) - .25;
  const passing = (frames: {title: number, card: number}[], key: 'title' | 'card') => {
    const [first, last] = [frames[0][key], frames[frames.length - 1][key]];
    return frames.filter((frame) => between(frame[key], first, last)).length;
  };

  for(const level of [2, 1] as const) {
    await page.evaluate((level) => (window as any).liteMode.setAnimationLevel(level), level);

    // * the summary comes: the title rises from the middle, the card grows by what the row grew
    const coming = await traceAlwaysUse(page, 'Style 1');
    const [first, last] = [coming[0], coming[coming.length - 1]];
    expect(last.title).toBeLessThan(first.title - 5);
    expect(last.card).toBeGreaterThan(first.card);
    expect(last.subtitles).toEqual([{opacity: 1, leaving: false}]);
    expect(passing(coming, 'card')).toBeGreaterThan(2);
    expect(coming.some(({subtitles}) => subtitles.some(({opacity}) => opacity > 0 && opacity < 1))).toBe(true);
    // * it goes there at the full level, and is there at once at the reduced one
    if(level === 2) {
      expect(passing(coming, 'title')).toBeGreaterThan(2);
      for(let i = 1; i < coming.length; ++i) expect(coming[i].title).toBeLessThanOrEqual(coming[i - 1].title + .01);
    } else {
      expect(passing(coming, 'title')).toBe(0);
    }

    // * and goes: the title comes back down, the card shrinks back, nothing of the summary is left
    const going = await traceAlwaysUse(page, 'Style 1');
    expect(going[going.length - 1].title).toBeCloseTo(first.title, 1);
    expect(going[going.length - 1].card).toBeCloseTo(first.card, 1);
    expect(going[going.length - 1].subtitles).toEqual([]);
    expect(passing(going, 'card')).toBeGreaterThan(2);
    // * reduced, the title is in the middle at once, where a fading summary would be under it: that one goes at once
    expect(going.some(({subtitles}) => subtitles.some(({leaving}) => leaving))).toBe(level === 2);
    expect(passing(going, 'title') > 2).toBe(level === 2);
  }

  expect(errors).toEqual([]);
});

test('what the popup opens with stands: the "Always use" row does not move as it opens', async({page}) => {
  await openHarness(page, {rich: false});
  // * opened anew, frame by frame from the start: the tab it opens on says what it asks for as it is made
  const moved = await page.evaluate(async() => {
    window.popupSandbox.closePopups();
    const path = '/e2e/fixtures/aiEditorPopup.ts';
    const {openAiPopupHarness} = await window.e2eImport(path);
    window.aiPopupHarness = openAiPopupHarness({rich: false, sendStyle: {saved: {proofRead: true}}});
    const moved: string[] = [];
    for(const start = performance.now(); performance.now() - start < 500;) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const row = [...document.querySelectorAll('.popup.active .row')].find((row) => row.textContent.includes('Always use in this chat'));
      // * what the row's lines are moved by, not the styles' own transitions (a disabled row fading)
      const animations = row?.closest('.sidebar-left-section').getAnimations({subtree: true})
      .filter((animation) => !(animation instanceof CSSTransition) && !(animation instanceof CSSAnimation));
      moved.push(...(animations || []).map((animation) => ((animation.effect as KeyframeEffect).target as Element).className.toString()));
    }
    return moved;
  });
  expect(moved).toEqual([]);
});

for(const direction of ['ltr', 'rtl'] as const) test(`styles that do not all fit cut the last one in sight in half, those that fit stretch over the row (${direction})`, async({page}) => {
  // * where each style stands along the row, from its inline start, and how far the row shows them
  const measure = () => page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('.popup.active [class*="tonesList"]');
    const style = getComputedStyle(list);
    const rtl = style.direction === 'rtl';
    const rect = list.getBoundingClientRect();
    const items = [...list.children].map((item) => {
      const {left, right} = item.getBoundingClientRect();
      return rtl ? [rect.right - right, rect.right - left] : [left - rect.left, right - rect.left];
    });
    return {
      items,
      shown: list.clientWidth,
      paddingEnd: parseFloat(style.paddingInlineEnd),
      minWidth: parseFloat(style.getPropertyValue('--tone-min-width'))
    };
  });

  for(const tones of [12, 1]) {
    await openHarness(page, {rich: false, tones});
    if(direction === 'rtl') await page.evaluate(() => window.popupSandbox.setDirection('rtl'));

    // * Prompt, the styles, Create
    await expect.poll(async() => (await measure()).items.length).toBe(tones + 2);
    const {items, shown, paddingEnd, minWidth} = await measure();
    for(const [start, end] of items) expect(end - start).toBeGreaterThanOrEqual(minWidth - .5);
    if(tones > 1) {
      const cut = items.find(([start, end]) => start < shown && end > shown);
      expect(cut).toBeDefined();
      expect((shown - cut[0]) / (cut[1] - cut[0])).toBeCloseTo(.5, 1);
    } else {
      expect(items[items.length - 1][1]).toBeCloseTo(shown - paddingEnd, 0);
    }

    await page.evaluate(() => window.popupSandbox.setDirection('ltr'));
  }
});
