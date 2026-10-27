import {expect, type Page, type Request} from '@playwright/test';
import {test} from './workerContext';
import {preparePopupSandbox} from './popupSandbox.helpers';

declare global {
  interface Window {
    paymentCardToken: unknown
  }
}

/*
 * The card form hands the card to Stripe for a token. The card goes in the request's BODY: a URL is
 * what servers and proxies on the way log, and a card number or a CVC must never end up in one.
 * A field the provider did not ask for (here the billing country and zip) is left out, not sent as
 * the string 'undefined'. A card Stripe refuses keeps the form open and says why. Stripe itself is
 * never reached: the request is answered here.
 */

async function fillCardForm(page: Page, answer: {status?: number, json: object}) {
  const requests: Request[] = [];
  await page.route('https://api.stripe.com/**', async(route) => {
    requests.push(route.request());
    await route.fulfill(answer);
  });

  await preparePopupSandbox(page, false);
  await page.evaluate(async() => {
    const popupPath = '/src/components/popups/paymentCard.tsx';
    const fixturesPath = '/src/components/popupSandbox/fixtures.ts';
    const {default: showPaymentCardPopup} = await window.e2eImport(popupPath);
    const {paymentForm, selfUser} = await window.e2eImport(fixturesPath);
    showPaymentCardPopup({
      paymentForm: {
        ...paymentForm,
        native_params: {_: 'dataJSON', data: JSON.stringify({publishable_key: 'pk_test_sandbox', need_cardholder_name: true})}
      },
      user: selfUser,
      onFinish: ({token}: {token: unknown}) => window.paymentCardToken = token
    });
  });

  const popup = page.locator('.popup-payment-card.active');
  await expect(popup).toBeVisible();
  await popup.locator('input[autocomplete="cc-number"]').pressSequentially('4242424242424242');
  await popup.locator('input[autocomplete="cc-exp"]').pressSequentially('1230');
  // the CVC is a password field, which takes its own name and autocomplete
  await popup.locator('input.input-field-input[type="password"]').pressSequentially('123');
  // the cardholder's name is the form's only rich field
  await popup.locator('[contenteditable="true"]').pressSequentially('Test User');
  await popup.locator('.popup-footer-button').click();

  return {popup, requests};
}

test('the card form sends the card to Stripe in the body, not the URL', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const {requests} = await fillCardForm(page, {json: {id: 'tok_sandbox', object: 'token', type: 'card'}});

  // only what the server needs: the token's id, not the rest of Stripe's answer
  await expect.poll(() => page.evaluate(() => window.paymentCardToken)).toEqual({type: 'card', id: 'tok_sandbox'});
  expect(requests).toHaveLength(1);
  const [request] = requests;
  expect(request.method()).toBe('POST');
  expect(request.url()).toBe('https://api.stripe.com/v1/tokens');
  expect(request.headers()['authorization']).toBe('Bearer pk_test_sandbox');
  expect(Object.fromEntries(new URLSearchParams(request.postData()))).toEqual({
    'card[number]': '4242 4242 4242 4242',
    'card[exp_month]': '12',
    'card[exp_year]': '30',
    'card[cvc]': '123',
    'card[name]': 'Test User'
  });

  expect(errors).toEqual([]);
});

test('a card Stripe refuses keeps the form open and says why', async({page}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  const message = 'Your card number is incorrect.';
  const {popup, requests} = await fillCardForm(page, {
    status: 402,
    json: {error: {type: 'card_error', code: 'incorrect_number', message, param: 'number'}}
  });

  await expect(page.locator('.toast')).toContainText(message);
  await expect(popup.locator('input[autocomplete="cc-number"]')).toHaveClass(/\berror\b/);
  await expect(popup).toBeVisible();
  await expect(popup.locator('.popup-footer-button')).toBeEnabled();
  expect(requests).toHaveLength(1);
  expect(await page.evaluate(() => window.paymentCardToken)).toBeUndefined();

  expect(errors).toEqual([]);
});
