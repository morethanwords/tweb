import type {StarsSubscription} from '@layer';
import {getStarsSubscriptionPresentation} from '@appManagers/utils/payments/starsSubscription';

const subscription = (pFlags: StarsSubscription['pFlags'] = {}, until_date = 200): StarsSubscription => ({
  _: 'starsSubscription',
  id: 'subscription',
  pFlags,
  peer: {_: 'peerUser', user_id: 1},
  until_date,
  pricing: {_: 'starsSubscriptionPricing', amount: 10, period: 60}
});

describe('Stars subscription display state', () => {
  test('active subscriptions show renewal and price', () => {
    expect(getStarsSubscriptionPresentation(subscription(), 100)).toMatchObject({
      dateLabelKey: 'Stars.Subscription.Renews', statusKey: undefined, showPrice: true
    });
  });

  test.each([99, 100])('subscriptions ending at %i are expired at 100', (until) => {
    expect(getStarsSubscriptionPresentation(subscription({}, until), 100)).toMatchObject({
      dateLabelKey: 'Stars.Subscription.Expired', captionKey: 'Stars.Subscription.ExpiredCaption', showPrice: false
    });
  });

  test('a user cancellation expires instead of renewing', () => {
    expect(getStarsSubscriptionPresentation(subscription({canceled: true}), 100)).toMatchObject({
      dateLabelKey: 'Stars.Subscription.Expires', statusKey: 'Stars.Subscriptions.Cancelled', showPrice: false
    });
  });

  test.each([false, true])('distinguishes bot and business cancellations, business=%s', (business) => {
    const key = business ? 'Stars.Subscription.BusinessCancelled' : 'Stars.Subscription.BotCancelled';
    expect(getStarsSubscriptionPresentation(subscription({bot_canceled: true}), 100, business)).toMatchObject({
      canceled: true, dateLabelKey: 'Stars.Subscription.Expires', statusKey: key, captionKey: key, showPrice: false
    });
  });

  test('expired cancelled subscriptions retain cancellation cause without a future expiry label', () => {
    expect(getStarsSubscriptionPresentation(subscription({bot_canceled: true}, 50), 100)).toMatchObject({
      dateLabelKey: 'Stars.Subscription.Expired', statusKey: 'Stars.Subscription.BotCancelled'
    });
  });

  test('missing balance is explicit without hiding the renewal price', () => {
    expect(getStarsSubscriptionPresentation(subscription({missing_balance: true}), 100)).toMatchObject({
      statusKey: 'Stars.Subscription.MissingBalance', captionKey: 'Stars.Subscription.MissingBalanceCaption', showPrice: true
    });
  });

  test('already-paid access can be restored only before expiration', () => {
    expect(getStarsSubscriptionPresentation(subscription({can_refulfill: true}), 100)).toMatchObject({
      canRefulfill: true, captionKey: 'Stars.Subscription.RestoreCaption'
    });
    expect(getStarsSubscriptionPresentation(subscription({can_refulfill: true}, 100), 100).canRefulfill).toBe(false);
  });
});
