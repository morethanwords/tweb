import {defineStories} from '@components/popupSandbox/registry';
import type {PopupStoryContext} from '@components/popupSandbox/context';
import type {StarsSubscription} from '@layer';

type SubscriptionScenario = {id: string, period?: number, pFlags?: StarsSubscription['pFlags'], expired?: boolean, business?: boolean, channel?: boolean};

const scenarios: SubscriptionScenario[] = [
  {id: 'minute', period: 60},
  {id: 'five-minutes', period: 300},
  {id: 'cancelled', pFlags: {canceled: true}},
  {id: 'expired', expired: true},
  {id: 'bot-cancelled', pFlags: {bot_canceled: true}},
  {id: 'business-cancelled', pFlags: {bot_canceled: true}, business: true},
  {id: 'missing-balance', pFlags: {missing_balance: true}},
  {id: 'restore-bot', pFlags: {can_refulfill: true}},
  {id: 'restore-channel', pFlags: {can_refulfill: true}, channel: true}
];

function makeSubscription(ctx: PopupStoryContext, scenario: typeof scenarios[number]): StarsSubscription {
  return {
    _: 'starsSubscription',
    id: `sandbox-subscription-${scenario.id}`,
    pFlags: scenario.pFlags || {},
    peer: scenario.channel ? {_: 'peerChannel', channel_id: ctx.peer('channel').toChatId()} : {_: 'peerUser', user_id: ctx.peer(scenario.business ? 'private' : 'bot').toUserId()},
    title: `Subscription product ${scenario.id}`,
    photo: {_: 'webDocumentNoProxy', url: 'https://example.com/sandbox-subscription.png', size: 128, mime_type: 'image/png', attributes: []},
    until_date: Math.floor(Date.now() / 1000) + (scenario.expired ? -60 : 86400),
    pricing: {_: 'starsSubscriptionPricing', period: scenario.period || 2592000, amount: 10}
  };
}

defineStories('Transactions', scenarios.map((scenario) => ({
  id: `transaction/subscription-${scenario.id}`,
  title: `Subscription ${scenario.id}`,
  fixtureOnly: true,
  managers: () => ({appPaymentsManager: {fulfillStarsSubscription: () => true}}),
  open: async(ctx) => {
    const {default: PopupPayment} = await import('@components/popups/payment');
    await PopupPayment.create({subscription: makeSubscription(ctx, scenario), noPaymentForm: true});
  }
})));

defineStories('Transactions', [{
  id: 'transaction/subscription-list',
  title: 'Subscription list display variants',
  fixtureOnly: true,
  managers: (ctx) => ({
    appPaymentsManager: {
      getStarsSubscriptions: () => ({
        _: 'payments.starsStatus',
        balance: {_: 'starsAmount', amount: 100, nanos: 0},
        users: [], chats: [],
        subscriptions: scenarios.map((scenario) => makeSubscription(ctx, scenario))
      })
    }
  }),
  open: async() => {
    const [{default: PopupElement}, {default: PopupStars}] = await Promise.all([
      import('@components/popups'), import('@components/popups/stars')
    ]);
    PopupElement.createPopup(PopupStars);
  }
}]);
