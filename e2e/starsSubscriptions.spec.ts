import {expect, test} from '@playwright/test';

test('subscription receipts show product, actual billing period and cancellation state', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  for(const [id, state] of [
    ['minute', 'Renews'], ['five-minutes', 'Renews'], ['cancelled', 'Expires'],
    ['expired', 'Expired'], ['bot-cancelled', 'Cancelled by the bot'],
    ['business-cancelled', 'Cancelled by the business'], ['missing-balance', 'Insufficient Stars']
  ]) {
    await page.evaluate((id) => window.popupSandbox.open(`transaction/subscription-${id}`), id);
    const popup = page.locator('.popup-stars-pay.active');
    await expect(popup).toBeVisible();
    await expect(popup.locator('.popup-stars-title')).toHaveText(`Subscription product ${id}`);
    await expect(popup.locator('.popup-stars-pay-avatar .popup-stars-pay-item')).toHaveCount(1);
    await expect(popup.locator('table')).toContainText(state);
    if(id === 'minute' || id === 'five-minutes') {
      await expect(popup.locator('.popup-stars-subtitle')).toContainText(id === 'minute' ? '1 minute' : '5 minutes');
      await expect(popup.locator('.popup-stars-subtitle')).not.toContainText('month');
    }
    if(id.includes('cancelled') || id === 'expired') await expect(popup.locator('table')).not.toContainText('Renews');
    if(id === 'bot-cancelled' || id === 'business-cancelled') {
      await expect(popup.locator('.popup-footer button').filter({hasText: /^OK$/})).toBeVisible();
      await expect(popup.locator('.popup-footer')).not.toContainText('Cancel Subscription');
    }
    if(id === 'missing-balance') await expect(popup.locator('.popup-stars-pay-tos2')).toContainText('not have enough Stars');
    await page.evaluate(() => window.popupSandbox.closePopups());
    await expect(popup).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('subscription history rows show invoice names, billing periods and terminal statuses', async({page}) => {
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.evaluate(() => window.popupSandbox.open('transaction/subscription-list'));
  const section = page.locator('.popup-stars-subscriptions-section');
  await expect(section).toContainText('Subscription product minute');
  await expect(section).toContainText('per 1 minute');
  await expect(section).toContainText('per 5 minutes');
  await expect(section).toContainText('Cancelled by the bot');
  await expect(section).toContainText('Cancelled by the business');
  await expect(section).toContainText('Insufficient Stars');
  await expect(section).toContainText('expired on');
  const media = section.locator('.row-media');
  await expect(media).toHaveCount(9);
  const oversized = await media.evaluateAll((elements) => elements.map((element) => ({
    container: element.getBoundingClientRect().width,
    image: element.firstElementChild?.getBoundingClientRect().width || 0
  })).filter(({container, image}) => image > container + 1));
  expect(oversized).toEqual([]);
});

test('already-paid bot and channel subscriptions restore through the existing manager', async({page}) => {
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.evaluate(() => {
    (window as any).appImManager.setInnerPeer = (params: unknown) => (window as any).restoredSubscriptionPeer = params;
  });
  for(const kind of ['bot', 'channel']) {
    await page.evaluate((kind) => window.popupSandbox.open(`transaction/subscription-restore-${kind}`), kind);
    const popup = page.locator('.popup-stars-pay.active');
    await expect(popup).toBeVisible();
    await expect(popup.locator('.popup-stars-pay-tos2')).toContainText('already paid');
    await popup.getByRole('button', {name: kind === 'bot' ? 'RESUME SUBSCRIPTION' : 'SUBSCRIBE TO CHANNEL', exact: true}).click();
    await expect.poll(() => page.evaluate(() => {
      const sandbox = window.popupSandbox as typeof window.popupSandbox & {calls(): {manager: string, method: string, args: unknown[]}[]};
      return sandbox.calls().filter((call) => call.manager === 'appPaymentsManager' && call.method === 'fulfillStarsSubscription').map((call) => call.args[0]);
    })).toContain(`sandbox-subscription-restore-${kind}`);
    await expect(popup).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => (window as any).restoredSubscriptionPeer?.peerId)).toBe(kind === 'bot' ? 777004 : -888002);
  }
});

test('mobile subscription statuses and product names stay within the popup', async({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.evaluate(() => (window.popupSandbox as unknown as {hide(): void}).hide());
  await page.evaluate(() => window.popupSandbox.open('transaction/subscription-list'));
  const section = page.locator('.popup-stars-subscriptions-section');
  const rows = section.locator('.popup-stars-transaction-row');
  await expect(rows).toHaveCount(9);
  await expect(section).toContainText('Cancelled by the business');
  const overflow = await rows.evaluateAll((elements) => elements.map((element) => ({
    right: element.getBoundingClientRect().right,
    scroll: element.scrollWidth,
    width: element.clientWidth
  })).filter((row) => row.right > window.innerWidth || row.scroll > row.width + 1));
  expect(overflow).toEqual([]);
});
