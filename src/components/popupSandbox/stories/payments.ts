/*
 * The invoice flow: methods, shipping, card entry.
 *
 * All three take a `payments.paymentForm` straight from the caller, so one fixture drives the whole
 * family. Popup modules are imported inside `open()` — see the note in `confirmations.ts`.
 */

import {defineStories} from '../registry';
import {botUser, paymentForm, selfUser, shippingOptions, validatedRequestedInfo} from '../fixtures';

defineStories('Payments', [
  {
    id: 'payment/methods',
    fixtureOnly: true,
    title: 'Payment method',
    open: async() => {
      const {default: showPaymentMethodsPopup} = await import('@components/popups/paymentMethods');
      showPaymentMethodsPopup({paymentForm, user: botUser});
    }
  },
  {
    id: 'payment/shipping',
    fixtureOnly: true,
    title: 'Shipping information',
    open: async() => {
      const {default: showPaymentShippingPopup} = await import('@components/popups/paymentShipping');
      showPaymentShippingPopup({
        paymentForm,
        inputInvoice: {
          _: 'inputInvoiceMessage',
          peer: {_: 'inputPeerSelf'},
          msg_id: 1
        }
      });
    }
  },
  {
    id: 'payment/shippingMethods',
    fixtureOnly: true,
    title: 'Shipping method',
    open: async() => {
      const {default: showPaymentShippingMethodsPopup} = await import('@components/popups/paymentShippingMethods');
      showPaymentShippingMethodsPopup({
        paymentForm,
        requestedInfo: validatedRequestedInfo,
        shippingOption: shippingOptions[0]
      });
    }
  },
  {
    id: 'payment/card',
    fixtureOnly: true,
    title: 'Card details',
    open: async() => {
      const {default: showPaymentCardPopup} = await import('@components/popups/paymentCard');

      // The `user` here is the payer, not the bot — the card form derives its country from that phone.
      showPaymentCardPopup({paymentForm, user: selfUser});
    }
  }
]);

// The sandbox reloads on an edit anyway (watchForEdits). Accepting here keeps an edit of a popup this story imports
// from climbing through the story to the app's root once the sandbox has been opened on the dev server.
if(import.meta.hot) import.meta.hot.accept();
