import {expect, type Page} from '@playwright/test';
import {test} from './workerContext';
import {closeStory, openStory, preparePopupSandbox} from './popupSandbox.helpers';

/*
 * The saved order information (name, e-mail, postal address) reaches the BOT the moment the client
 * validates it: for a flexible invoice the server turns `payments.validateRequestedInfo` into a
 * shipping query carrying the whole address. So the checkout fills its rows from `saved_info`
 * locally and validates nothing until the user has pressed Pay — a popup that merely opened must
 * not have told the bot who is looking at the invoice and where they live.
 */

const STORY = 'payment/invoiceSavedInfo';
const SAVED_ADDRESS = 'Sandboxville, 1 Sandbox Street';

function validations(page: Page) {
  return page.evaluate(() => window.popupSandbox.calls()
  .filter(({manager, method}) => manager === 'appPaymentsManager' && method === 'validateRequestedInfo')
  .length);
}

test.describe('invoice checkout with saved information', () => {
  test('does not validate the saved information before the user pays', async({page}) => {
    await preparePopupSandbox(page, false);
    expect(await openStory(page, STORY)).toBeNull();

    const checkout = page.locator('.popup-payment');
    await expect(checkout).toBeVisible();
    // the saved address is on screen, so it was rendered from the form rather than fetched
    await expect(checkout).toContainText(SAVED_ADDRESS);
    expect(await validations(page)).toBe(0);

    // ...and the first press is what discloses it, which carries on into the shipping methods
    await checkout.locator('.popup-footer-button').click();
    await expect(page.locator('.popup-payment-shipping-methods')).toBeVisible();
    expect(await validations(page)).toBe(1);

    expect(await closeStory(page, {})).toBe(true);
  });
});
