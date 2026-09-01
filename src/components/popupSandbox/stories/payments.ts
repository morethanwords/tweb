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
      const [{default: PopupElement}, {default: PopupPaymentMethods}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/paymentMethods')
      ]);

      PopupElement.createPopup(PopupPaymentMethods, paymentForm, botUser).show();
    }
  },
  {
    id: 'payment/shipping',
    fixtureOnly: true,
    title: 'Shipping information',
    open: async() => {
      const [{default: PopupElement}, {default: PopupPaymentShipping}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/paymentShipping')
      ]);

      PopupElement.createPopup(PopupPaymentShipping, paymentForm, {
        _: 'inputInvoiceMessage',
        peer: {_: 'inputPeerSelf'},
        msg_id: 1
      }).show();
    }
  },
  {
    id: 'payment/shippingMethods',
    fixtureOnly: true,
    title: 'Shipping method',
    open: async() => {
      const [{default: PopupElement}, {default: PopupPaymentShippingMethods}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/paymentShippingMethods')
      ]);

      PopupElement.createPopup(
        PopupPaymentShippingMethods,
        paymentForm,
        validatedRequestedInfo,
        shippingOptions[0]
      ).show();
    }
  },
  {
    id: 'payment/card',
    fixtureOnly: true,
    title: 'Card details',
    open: async() => {
      const [{default: PopupElement}, {default: PopupPaymentCard}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/paymentCard')
      ]);

      // The `user` here is the payer, not the bot — the card form derives its country from that phone.
      PopupElement.createPopup(PopupPaymentCard, paymentForm, selfUser).show();
    }
  }
]);
