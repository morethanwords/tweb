import {defineStories} from '@components/popupSandbox/registry';
import {createTransactionFixtures} from '@components/popupSandbox/transactionFixtures';
import {photo} from '@components/popupSandbox/fixtures';
import type {PopupStoryContext} from '@components/popupSandbox/context';
import type {StarGift} from '@layer';

function transactionManagers(ctx: PopupStoryContext) {
  return {
    appMessagesManager: {
      generateStandaloneOutgoingMessage: (peerId: PeerId) => ({...ctx.message('channel'), peerId})
    },
    appGiftsManager: {
      wrapGift: (raw: StarGift) => ({...(raw._ === 'starGiftUnique' ? ctx.uniqueGift() : ctx.gift()), raw})
    }
  };
}

function fixturesForContext(ctx: PopupStoryContext) {
  return createTransactionFixtures({
    peer: {_: 'peerChannel', channel_id: ctx.peer('channel').toChatId()},
    affiliate: {_: 'peerUser', user_id: ctx.peer('bot').toUserId()},
    gift: ctx.gift().raw,
    uniqueGift: ctx.uniqueGift().raw,
    media: {_: 'messageMediaPhoto', pFlags: {}, photo},
    msgId: ctx.mid('channel')
  });
}

defineStories('Transactions', createTransactionFixtures().map(({id}) => ({
  id: `transaction/${id}`,
  title: id,
  fixtureOnly: true,
  managers: transactionManagers,
  open: async(ctx) => {
    const {default: PopupPayment} = await import('@components/popups/payment');
    const transaction = fixturesForContext(ctx).find((entry) => entry.id === id).transaction;
    await PopupPayment.create({transaction});
  }
})));

defineStories('Transactions', [false, true].flatMap((ton) => (['self', 'channel'] as const).map((owner) => ({
  id: `transaction/history-${ton ? 'gram' : 'stars'}-${owner}`,
  title: `${ton ? 'Gram' : 'Stars'} history · ${owner}`,
  fixtureOnly: true,
  managers: (ctx) => ({
    ...transactionManagers(ctx),
    appPaymentsManager: {
      getStarsTransactions: (_offset: string, inbound?: boolean) => ({
        _: 'payments.starsStatus',
        balance: ton ? {_: 'starsTonAmount', amount: '1250000000'} : {_: 'starsAmount', amount: 1250, nanos: 0},
        users: [],
        chats: [],
        history: fixturesForContext(ctx).map(({transaction}) => transaction).filter((transaction) =>
          transaction.id && (transaction.amount._ === 'starsTonAmount') === ton &&
          (inbound === undefined || (Number(transaction.amount.amount) > 0) === inbound)
        )
      })
    }
  }),
  open: async(ctx) => {
    const [{default: PopupElement}, {default: PopupStars}] = await Promise.all([
      import('@components/popups'),
      import('@components/popups/stars')
    ]);
    PopupElement.createPopup(PopupStars, {ton, historyPeerId: ctx.peer(owner)});
  }
}))));

defineStories('Transactions', [
  {
    id: 'transaction/history-retry-pages',
    title: 'History retry, pagination and overlapping transactions',
    fixtureOnly: true,
    managers: (ctx) => {
      let attempts = 0;
      const original = {...fixturesForContext(ctx)[0].transaction, id: 'sandbox-shared-id', title: 'Original expense'};
      const received = {...original, title: 'Same ID received', amount: {_: 'starsAmount', amount: 12, nanos: 500000001} as const};
      const refund = {...received, title: 'Same ID refund', pFlags: {refund: true} as const};
      const another = {...original, id: 'sandbox-another-id', title: 'Another payment'};
      const last = {...original, id: 'sandbox-last-page', title: 'Last page payment'};
      return {
        appPaymentsManager: {
          getStarsTransactions: (offset: string, inbound?: boolean) => {
            if(attempts++ === 0) return Promise.reject(new Error('Synthetic first-page failure'));
            return {
              _: 'payments.starsStatus',
              balance: {_: 'starsAmount', amount: 1250, nanos: 0},
              users: [],
              chats: [],
              next_offset: inbound === undefined && !offset ? 'sandbox-next-page' : undefined,
              history: inbound !== undefined ? [] : offset ? [original, refund, last] : [original, received, another]
            };
          }
        }
      };
    },
    open: async(ctx) => {
      const [{default: PopupElement}, {default: PopupStars}] = await Promise.all([
        import('@components/popups'),
        import('@components/popups/stars')
      ]);
      PopupElement.createPopup(PopupStars, {historyPeerId: ctx.peer('self')});
    }
  },
  {
    id: 'transaction/bot-subscription',
    title: 'Active bot subscription',
    fixtureOnly: true,
    open: async(ctx) => {
      const {default: PopupPayment} = await import('@components/popups/payment');
      await PopupPayment.create({
        noPaymentForm: true,
        subscription: {
          _: 'starsSubscription',
          id: 'sandbox-bot-subscription',
          pFlags: {},
          peer: {_: 'peerUser', user_id: ctx.peer('bot').toUserId()},
          title: 'Sandbox bot subscription',
          invoice_slug: 'sandbox-subscription',
          until_date: Math.floor(Date.now() / 1000) + 2592000,
          pricing: {_: 'starsSubscriptionPricing', period: 2592000, amount: 10}
        }
      });
    }
  },
  {
    id: 'transaction/gram-nano-receipt',
    title: 'One nanogram payment receipt',
    fixtureOnly: true,
    open: async(ctx) => {
      const {default: PopupPayment} = await import('@components/popups/payment');
      await PopupPayment.create({
        paymentForm: {
          _: 'payments.paymentReceiptStars',
          bot_id: ctx.peer('bot').toUserId(),
          title: 'Sandbox nanogram purchase',
          description: 'A one-nanogram purchase',
          date: 1717200000,
          transaction_id: 'sandbox-one-nanogram',
          currency: 'TON',
          total_amount: 1,
          invoice: {_: 'invoice', pFlags: {}, currency: 'TON', prices: [{_: 'labeledPrice', label: 'Purchase', amount: 1}]},
          users: []
        }
      });
    }
  }
]);
