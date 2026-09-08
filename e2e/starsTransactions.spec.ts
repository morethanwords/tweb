import {expect, test} from '@playwright/test';
import Icons from '../src/icons';
import {createTransactionFixtures} from '../src/components/popupSandbox/transactionFixtures';

const cases = createTransactionFixtures();

// Expectations are intentionally independent of the runtime classifier.
const titles: Record<string, RegExp> = {
  payment: /^Sandbox invoice$/,
  'payment-photo': /^Sandbox product$/,
  'empty-media': /^Payment$/,
  'message-link': /^Payment$/,
  media: /Media Purchase/i,
  reaction: /Reaction/i,
  messages: /3 messages/i,
  'messages-income': /3 messages/i,
  'live-message': /Live stream messages.*2/,
  'live-reaction': /^Live stream reaction$/,
  premium: /Telegram Premium.*12 months/,
  search: /^Post search fee$/,
  api: /Paid broadcast.*123 messages/,
  'affiliate-income': /Affiliate commission.*12.5%/,
  auction: /^Gift auction bid$/,
  'auction-refund': /^Gift auction bid$/,
  upgrade: /^Gift upgrade$/,
  'upgrade-refund': /^Gift upgrade$/,
  'prepaid-upgrade': /^Prepaid gift upgrade$/,
  'remove-description': /^Gift description removed$/,
  'gift-transfer': /^Gift transfer$/,
  'gift-transfer-refund': /^Gift transfer$/,
  'resale-income': /^Gift sale$/,
  'resale-expense': /^Gift purchase$/,
  'resale-income-refund': /^Gift purchase$/,
  'resale-expense-refund': /^Gift sale$/,
  business: /^Business bot transfer$/,
  'ads-proceeds': /^Advertising revenue$/,
  withdrawal: /^Withdrawal via Fragment$/,
  'withdrawal-refund': /^Withdrawal via Fragment$/,
  'subscription-minute': /^Subscription fee$/,
  'subscription-five-minutes': /^Subscription fee$/
};

function amountText(transaction: typeof cases[number]['transaction']) {
  const amount = transaction.amount;
  const scale = BigInt(1000000000), zero = BigInt(0);
  const value = amount._ === 'starsTonAmount' ? BigInt(amount.amount) : BigInt(amount.amount) * scale + BigInt(amount.nanos);
  const absolute = value < zero ? -value : value;
  const fraction = (absolute % scale).toString().padStart(9, '0').replace(/0+$/, '');
  return (value < zero ? '-' : value > zero ? '+' : '') + (absolute / scale).toString() + (fraction ? '.' + fraction : '');
}

test('all Stars and Gram receipts show the operation, exact amount, status and transaction fields', async({page}) => {
  test.setTimeout(10 * 60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if(message.type() === 'error' && message.text().startsWith('solid error')) errors.push(message.text());
  });
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  for(const {id, transaction} of cases) {
    await test.step(id, async() => {
      errors.length = 0;
      await page.evaluate((id) => window.popupSandbox.open('transaction/' + id), id);
      const popup = page.locator('.popup-stars-pay.active');
      await expect(popup).toBeVisible({timeout: 15_000});
      const title = popup.locator('.popup-stars-title');
      await expect(title).not.toBeEmpty();
      const expectedTitle = titles[id.split('/')[1]];
      if(expectedTitle) await expect(title).toHaveText(expectedTitle);
      const amount = popup.locator('.popup-stars-pay-padding > .popup-stars-pay-amount');
      await expect(amount).toContainText(amountText(transaction));
      await expect(amount.locator('.tgico')).toHaveCount(transaction.amount._ === 'starsTonAmount' ? 1 : 0);
      if(transaction.id) await expect(popup.locator('table')).toContainText(transaction.id);
      else await expect(popup.locator('table')).not.toContainText('Transaction ID');
      const providerIcons: Record<string, string> = {
        starsTransactionPeerAppStore: 'apple_filled',
        starsTransactionPeerPlayMarket: 'android_filled',
        starsTransactionPeerPremiumBot: 'premium',
        starsTransactionPeerFragment: 'ton',
        starsTransactionPeerAds: 'ads',
        starsTransactionPeerAPI: 'bots',
        starsTransactionPeerUnsupported: 'info'
      };
      const providerIcon = providerIcons[transaction.peer._];
      if(providerIcon) await expect(popup.locator('.popup-stars-pay-avatar .tgico')).toHaveText(String.fromCharCode(parseInt(Icons[providerIcon as keyof typeof Icons], 16)));
      if(transaction.premium_gift_months) await expect(popup.locator('.popup-stars-pay-sticker')).toBeVisible();
      const body = popup.locator('table');
      const flag = transaction.pFlags;
      if(flag.refund) await expect(body).toContainText(/Refund/i);
      else if(flag.failed) await expect(body).toContainText(/Failed/i);
      else if(flag.pending) await expect(body).toContainText(/Pending/i);
      if(transaction.msg_id || transaction.giveaway_post_id) await expect(body.locator('a').first()).toBeVisible();
      if(transaction.transaction_url) {
        await expect(body).toContainText('Blockchain transaction');
        await expect(body).toContainText('Completed');
      }
      if(transaction.premium_gift_months) await expect(body).toContainText('12 months');
      if(transaction.subscription_period) await expect(body).toContainText(`${transaction.subscription_period} seconds`);
      if(transaction.ads_proceeds_from_date) await expect(body).toContainText('Revenue period');
      if(transaction.starref_amount) await expect(body).toContainText('Commission amount');
      if(transaction.paid_messages !== undefined || transaction.floodskip_number !== undefined) await expect(body).toContainText('Messages');
      if(transaction.stargift?._ === 'starGiftUnique') {
        await expect(body).toContainText('Model');
        await expect(body).toContainText('Backdrop');
        await expect(body).toContainText('Symbol');
      }
      expect(errors, id).toEqual([]);
      await page.evaluate(() => window.popupSandbox.closePopups());
      await expect(page.locator('.popup-stars-pay')).toHaveCount(0);
    });
  }
});

for(const ton of [false, true]) {
  for(const owner of ['self', 'channel']) test(`${ton ? 'Gram' : 'Stars'} ${owner} history renders every fixture and opens its receipt`, async({page}) => {
    test.setTimeout(120_000);
    await page.goto('/?popups=1');
    await page.waitForFunction(() => !!window.popupSandbox);
    await page.evaluate(() => window.popupSandbox.ready());
    await page.evaluate((id) => window.popupSandbox.open(id), `transaction/history-${ton ? 'gram' : 'stars'}-${owner}`);
    const popup = page.locator('.popup-stars.active');
    await expect(popup).toBeVisible();
    const rows = popup.locator('.popup-stars-transactions-section .row');
    const expected = cases.filter(({transaction}) => transaction.id && (transaction.amount._ === 'starsTonAmount') === ton);
    await expect(rows).toHaveCount(expected.length, {timeout: 30_000});
    for(let index = 0; index < expected.length; index++) {
      await expect(rows.nth(index)).toContainText(amountText(expected[index].transaction));
    }
    await rows.first().click();
    const receipt = page.locator('.popup-stars-pay.active');
    await expect(receipt).toBeVisible();
    await expect(receipt.locator('table')).toContainText(expected[0].transaction.id);
  });
}

test('a transaction source link navigates to its exact channel message', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if(message.type() === 'error' && message.text().startsWith('solid error')) errors.push(message.text());
  });
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.evaluate(() => window.popupSandbox.open('transaction/stars/message-link'));
  await page.evaluate(() => {
    (window as any).appImManager.setInnerPeer = (params: unknown) => (window as any).transactionNavigation = params;
  });
  await page.locator('.popup-stars-pay.active table a').first().click();
  await expect.poll(async() => ({navigation: await page.evaluate(() => (window as any).transactionNavigation), errors})).toMatchObject({navigation: {peerId: -888002, lastMsgId: 4294967297}, errors: []});
});

test('purchased media opens in the real media viewer', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.evaluate(() => (window.popupSandbox as unknown as {hide(): void}).hide());
  await page.evaluate(() => window.popupSandbox.open('transaction/stars/media'));
  await page.locator('.popup-stars-pay.active .popup-stars-pay-avatar').click();
  await expect(page.locator('.media-viewer-whole')).toBeVisible({timeout: 15_000});
  expect(errors).toEqual([]);
});

test('mobile Gram receipt and history fit the viewport without truncating int64 amounts', async({page}, testInfo) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.evaluate(() => (window.popupSandbox as unknown as {hide(): void}).hide());
  await page.evaluate(() => window.popupSandbox.open('transaction/stars/int64-gram'));
  const receipt = page.locator('.popup-stars-pay.active');
  await expect(receipt).toBeVisible();
  await expect(receipt.locator('.popup-stars-pay-padding > .popup-stars-pay-amount')).toContainText('+9223372036.854775807');
  const overflow = async() => page.locator('.popup.active .popup-container, .popup.active table, .popup.active .row').evaluateAll((elements) => elements.filter((element) => {
    const node = element as HTMLElement;
    return node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1;
  }).map((element) => ({class: element.className, width: element.clientWidth, scrollWidth: element.scrollWidth, text: element.textContent})));
  expect(await overflow()).toEqual([]);
  await receipt.screenshot({path: testInfo.outputPath('gram-int64-mobile.png'), animations: 'disabled'});
  await page.evaluate(() => window.popupSandbox.closePopups());
  await expect(page.locator('.popup-stars-pay')).toHaveCount(0);
  await page.evaluate(() => window.popupSandbox.open('transaction/history-gram-self'));
  const history = page.locator('.popup-stars.active');
  await expect(history.locator('.popup-stars-transactions-section .row')).toHaveCount(cases.filter(({transaction}) => transaction.id && transaction.amount._ === 'starsTonAmount').length);
  await history.screenshot({path: testInfo.outputPath('gram-history-mobile.png'), animations: 'disabled'});
  expect(await overflow()).toEqual([]);
});

test('bot subscription and one-nanogram invoice receipts render their amounts', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if(message.type() === 'error' && message.text().startsWith('solid error')) errors.push(message.text());
  });
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.evaluate(() => window.popupSandbox.open('transaction/bot-subscription'));
  const popup = page.locator('.popup-stars-pay.active');
  await expect(popup).toBeVisible();
  await expect(popup.locator('table')).toContainText('Sandbox Bot');
  await expect(popup.locator('button').filter({hasText: /Cancel Subscription/i})).toBeVisible();
  await page.evaluate(() => window.popupSandbox.closePopups());
  await expect(popup).toHaveCount(0);
  await page.evaluate(() => window.popupSandbox.open('transaction/gram-nano-receipt'));
  await expect(popup).toBeVisible();
  await expect(popup.locator('.popup-stars-pay-padding > .popup-stars-pay-amount')).toContainText('-0.000000001');
  await expect(popup.locator('.popup-stars-pay-padding > .popup-stars-pay-amount .tgico')).toHaveCount(1);
  await expect(popup.locator('table')).toContainText('sandbox-one-nanogram');
  expect(errors).toEqual([]);
});

test('history retries failures, loads the next page and preserves same-ID refund and incoming entries', async({page}) => {
  await page.goto('/?popups=1');
  await page.waitForFunction(() => !!window.popupSandbox);
  await page.evaluate(() => window.popupSandbox.ready());
  await page.evaluate(() => (window.popupSandbox as unknown as {hide(): void}).hide());
  await page.evaluate(() => window.popupSandbox.open('transaction/history-retry-pages'));
  const popup = page.locator('.popup-stars.active');
  await popup.getByRole('button', {name: 'Retry', exact: true}).click();
  const rows = popup.locator('.popup-stars-transaction-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({hasText: 'Original expense'})).toHaveCount(1);
  await expect(rows.filter({hasText: 'Same ID received'})).toHaveCount(1);
  await popup.getByRole('button', {name: 'Show More Options', exact: true}).click();
  await expect(rows).toHaveCount(5);
  await expect(rows.filter({hasText: 'Original expense'})).toHaveCount(1);
  await expect(rows.filter({hasText: 'Same ID received'})).toHaveCount(1);
  await expect(rows.filter({hasText: 'Same ID refund'})).toHaveCount(1);
  await expect(rows.filter({hasText: 'Last page payment'})).toHaveCount(1);
  await popup.locator('.popup-stars-transactions-tab').filter({hasText: /^Incoming$/}).click();
  await expect(popup.getByText('No transactions yet', {exact: true})).toBeVisible();
});
