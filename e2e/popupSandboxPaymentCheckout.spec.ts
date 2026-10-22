import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';
import {preparePopupSandbox} from './popupSandbox.helpers';
import type {PaymentRequestedInfo, PaymentsPaymentForm} from '@layer';

declare global {
  interface Window {
    paymentResult: string
  }
}

/*
 * The invoice checkout: what it shows from saved information, what it says when the payment is
 * refused, and that a shipping option the bot no longer offers is not paid for.
 */

const CHECKOUT = '.popup-payment:not(.popup-payment-card):not(.popup-payment-shipping):not(.popup-payment-shipping-methods)';

type FormPatch = {
  invoiceFlags?: PaymentsPaymentForm.paymentsPaymentForm['invoice']['pFlags'],
  savedInfo?: PaymentRequestedInfo | 'fixture',
  nativeParams?: object
};

/** Opens the checkout on the sandbox's invoice, changed by `patch`, and records how it finishes. */
async function openCheckout(page: Page, patch: FormPatch = {}) {
  await page.evaluate(async(patch) => {
    const popupPath = '/src/components/popups/payment.tsx';
    const fixturesPath = '/src/components/popupSandbox/fixtures.ts';
    const {createPaymentPopup} = await window.e2eImport(popupPath);
    const {paymentForm, savedPaymentInfo} = await window.e2eImport(fixturesPath);
    const handle = await createPaymentPopup({
      paymentForm: {
        ...paymentForm,
        invoice: patch.invoiceFlags ? {...paymentForm.invoice, pFlags: patch.invoiceFlags} : paymentForm.invoice,
        saved_info: patch.savedInfo === 'fixture' ? savedPaymentInfo : patch.savedInfo,
        native_params: patch.nativeParams ? {_: 'dataJSON', data: JSON.stringify(patch.nativeParams)} : paymentForm.native_params
      },
      inputInvoice: {_: 'inputInvoiceMessage', peer: {_: 'inputPeerSelf'}, msg_id: 1}
    });
    handle.addEventListener('finish', (result: string) => window.paymentResult = result);
  }, patch);

  const checkout = page.locator(`${CHECKOUT}.active`);
  await expect(checkout).toBeVisible();
  return checkout;
}

async function overrideManagers(page: Page, which: 'refusePayment' | 'dropStandardShipping') {
  await page.evaluate(async(which) => {
    const path = '/src/components/popupSandbox/environment.ts';
    const fixturesPath = '/src/components/popupSandbox/fixtures.ts';
    const {getMockManagers} = await window.e2eImport(path);
    const {validatedRequestedInfo, shippingOptions} = await window.e2eImport(fixturesPath);
    getMockManagers().override({appPaymentsManager: which === 'refusePayment' ? {
      sendPaymentForm: () => {
        throw {type: 'PAYMENT_FAILED'};
      }
    } : {
      validateRequestedInfo: () => ({
        ...validatedRequestedInfo,
        id: 'sandbox-info-2',
        shipping_options: shippingOptions.filter(({id}: {id: string}) => id !== 'standard')
      })
    }});
  }, which);
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

test('saved information without an address still opens a checkout that asks for one', async({page}) => {
  const checkout = await openCheckout(page, {
    savedInfo: {_: 'paymentRequestedInfo', name: 'Sandbox Buyer', email: 'buyer@example.com'}
  });

  await expect(checkout.locator('.payment-item-method-row')).toBeVisible();
  await expect(checkout).toContainText('Sandbox Buyer');
});

test('the shipping form opens over a saved address the invoice does not ask for', async({page}) => {
  const checkout = await openCheckout(page, {
    invoiceFlags: {name_requested: true},
    savedInfo: 'fixture'
  });

  await checkout.locator('.payment-item-row', {hasText: 'Sandbox Buyer'}).click();
  const shipping = page.locator('.popup-payment-shipping.active');
  await expect(shipping).toBeVisible();
  await expect(shipping.locator('[contenteditable="true"]')).toHaveText('Sandbox Buyer');
});

test('a payment the server refuses says so, and finishes as failed', async({page}) => {
  await page.route('https://api.stripe.com/**', (route) => route.fulfill({json: {id: 'tok_sandbox', type: 'card'}}));
  await overrideManagers(page, 'refusePayment');
  const checkout = await openCheckout(page, {invoiceFlags: {}, nativeParams: {publishable_key: 'pk_test_sandbox'}});

  // no card yet: Pay asks for one first
  await checkout.locator('.popup-footer-button').click();
  const card = page.locator('.popup-payment-card.active');
  await expect(card).toBeVisible();
  await card.locator('input[autocomplete="cc-number"]').pressSequentially('4242424242424242');
  await card.locator('input[autocomplete="cc-exp"]').pressSequentially('1230');
  await card.locator('input.input-field-input[type="password"]').pressSequentially('123');
  await card.locator('.popup-footer-button').click();
  await expect(card).toHaveCount(0);
  await expect(checkout.locator('.payment-item-method-row')).toContainText('4242');

  await checkout.locator('.popup-footer-button').click();
  await expect(page.locator('.toast')).toContainText('Sorry, the payment was declined.');
  await expect(checkout).toBeVisible();

  await page.evaluate(() => window.popupSandbox.closePopups());
  await expect.poll(() => page.evaluate(() => window.paymentResult)).toBe('failed');
});

test('a shipping option the bot no longer offers for a new address is not kept', async({page}) => {
  const checkout = await openCheckout(page, {savedInfo: 'fixture'});
  const prices = checkout.locator('.payment-item-prices');

  // the first press validates the saved address and asks for a shipping option
  await checkout.locator('.popup-footer-button').click();
  const methods = page.locator('.popup-payment-shipping-methods.active');
  await expect(methods).toBeVisible();
  await methods.locator('.popup-footer-button').click();
  await expect(methods).toHaveCount(0);
  await expect(checkout.locator('.payment-item-row', {hasText: 'Standard delivery'})).toBeVisible();
  await expect(prices).toContainText('Standard');

  // the bot answers the same address again, without that option
  await overrideManagers(page, 'dropStandardShipping');
  await checkout.locator('.payment-item-row', {hasText: 'Sandboxville'}).click();
  const shipping = page.locator('.popup-payment-shipping.active');
  await expect(shipping).toBeVisible();
  await shipping.locator('.popup-footer-button').click();
  await expect(shipping).toHaveCount(0);

  await expect(checkout.locator('.payment-item-row', {hasText: 'Standard delivery'})).toHaveCount(0);
  await expect(prices).not.toContainText('Standard');
});
