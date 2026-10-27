import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';
import {preparePopupSandbox} from './popupSandbox.helpers';

declare global {
  interface Window {
    paymentResult: string,
    releaseStarsPayment: () => void
  }
}

/*
 * Paying with Stars: whatever happens to the payment, the caller hears how it ended — a gift sent
 * without a popup (`noShowIfStars`) waits for that to unlock its button — and the payer is told
 * when it was refused.
 */

async function payWithStars(page: Page, options: {noShowIfStars?: boolean, sendStarsForm: 'refuse' | 'hold'}) {
  await page.evaluate(async(options) => {
    const environmentPath = '/src/components/popupSandbox/environment.ts';
    const fixturesPath = '/src/components/popupSandbox/fixtures.ts';
    const popupPath = '/src/components/popups/payment.tsx';
    const {getMockManagers} = await window.e2eImport(environmentPath);
    const {starsPaymentForm} = await window.e2eImport(fixturesPath);
    const {createPaymentPopup} = await window.e2eImport(popupPath);

    const held = new Promise<void>((resolve) => window.releaseStarsPayment = resolve);
    getMockManagers().override({appPaymentsManager: {
      sendStarsForm: options.sendStarsForm === 'refuse' ? () => {
        throw {type: 'BOT_PRECHECKOUT_FAILED'};
      } : () => held.then(() => ({_: 'payments.paymentResult', updates: {_: 'updates', updates: [] as any[], users: [] as any[], chats: [] as any[]}}))
    }});

    const handle = await createPaymentPopup({
      paymentForm: starsPaymentForm,
      inputInvoice: {_: 'inputInvoiceMessage', peer: {_: 'inputPeerSelf'}, msg_id: 1},
      noShowIfStars: options.noShowIfStars
    });
    handle.addEventListener('finish', (result: string) => window.paymentResult = result);
  }, options);
}

let pageErrors: string[];
test.beforeEach(async({page}) => {
  const errors: string[] = pageErrors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await preparePopupSandbox(page, false);
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

test('a refused payment without a popup tells the payer, and the caller that it failed', async({page}) => {
  await payWithStars(page, {noShowIfStars: true, sendStarsForm: 'refuse'});

  await expect(page.locator('.toast')).toContainText('Sorry, the payment was cancelled by the bot.');
  await expect.poll(() => page.evaluate(() => window.paymentResult)).toBe('failed');
});

test('a popup closed while the payment is on its way reports how the payment ended', async({page}) => {
  await payWithStars(page, {sendStarsForm: 'hold'});

  const popup = page.locator('.popup-stars-pay.active');
  await expect(popup).toBeVisible();
  await popup.locator('.popup-footer-button').first().click();
  await expect.poll(() => page.evaluate(() => window.popupSandbox.calls().some(({manager, method}) => (
    manager === 'appPaymentsManager' && method === 'sendStarsForm'
  )))).toBe(true);

  await page.evaluate(() => window.popupSandbox.closePopups());
  await expect(popup).toHaveCount(0);
  // still on its way: not 'pending', which callers take for done
  expect(await page.evaluate(() => window.paymentResult)).toBeUndefined();

  await page.evaluate(() => window.releaseStarsPayment());
  await expect.poll(() => page.evaluate(() => window.paymentResult)).toBe('paid');
});
