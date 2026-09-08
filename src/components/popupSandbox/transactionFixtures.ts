import type {MessageMedia, Peer, StarGift, StarsAmount, StarsTransaction, StarsTransactionPeer} from '@layer';

/** Shared synthetic ledger cases for the popup sandbox, classifier and browser regression tests. */
export function createTransactionFixtures(options: {
  peer?: Peer,
  affiliate?: Peer,
  gift?: StarGift,
  uniqueGift?: StarGift,
  media?: MessageMedia,
  msgId?: number
} = {}) {
  const peer = options.peer || {_: 'peerUser', user_id: 777002};
  const affiliate = options.affiliate || {_: 'peerChannel', channel_id: 888002};
  const gift = options.gift || {_: 'starGift'} as StarGift;
  const uniqueGift = options.uniqueGift || {_: 'starGiftUnique'} as StarGift;
  const media = options.media || {_: 'messageMediaPhoto', pFlags: {}, photo: {_: 'photoEmpty', id: '1'}};
  const msgId = options.msgId || 123;
  const cases: {id: string, transaction: StarsTransaction}[] = [];
  const makeAmount = (ton: boolean, negative = true): StarsAmount => ton ?
    {_: 'starsTonAmount', amount: negative ? '-1250000001' : '1250000001'} :
    {_: 'starsAmount', amount: negative ? -12 : 12, nanos: negative ? -500000001 : 500000001};
  const add = (id: string, fields: Partial<StarsTransaction>, gram = false) => {
    for(const ton of gram ? [false, true] : [false]) {
      const transaction: StarsTransaction = {
        _: 'starsTransaction',
        id: `sandbox-${ton ? 'gram' : 'stars'}-${id}`,
        date: 1717200000,
        peer: {_: 'starsTransactionPeer', peer},
        pFlags: {},
        amount: makeAmount(ton),
        ...fields
      };
      if(ton && fields.amount?._ === 'starsAmount') {
        transaction.amount = makeAmount(true, Number(fields.amount.amount) < 0);
      }
      if(ton && fields.starref_amount) transaction.starref_amount = {_: 'starsTonAmount', amount: '250000000'};
      cases.push({id: `${ton ? 'gram' : 'stars'}/${id}`, transaction});
    }
  };
  const incoming = {amount: makeAmount(false, false)};
  add('payment', {title: 'Sandbox invoice', description: 'Invoice description', bot_payload: new Uint8Array([1, 2, 3])}, true);
  add('payment-photo', {title: 'Sandbox product', photo: {_: 'webDocumentNoProxy', url: 'https://example.com/sandbox-product.png', size: 128, mime_type: 'image/png', attributes: []}});
  add('empty-media', {extended_media: []}, true);
  add('media', {extended_media: [media, media], msg_id: msgId}, true);
  add('message-link', {msg_id: msgId}, true);
  add('reaction', {pFlags: {reaction: true}, msg_id: msgId});
  add('messages', {paid_messages: 3});
  add('messages-income', {...incoming, paid_messages: 3, starref_commission_permille: 150, starref_amount: {_: 'starsAmount', amount: 2, nanos: 500000000}});
  add('live-message', {pFlags: {phonegroup_message: true}, paid_messages: 2});
  add('live-reaction', {pFlags: {phonegroup_message: true, reaction: true}, paid_messages: 2});
  add('subscription', {subscription_period: 2592000});
  add('subscription-minute', {subscription_period: 60});
  add('subscription-five-minutes', {subscription_period: 300});
  add('premium', {premium_gift_months: 12});
  add('search', {pFlags: {posts_search: true}});
  add('api', {floodskip_number: 123, peer: {_: 'starsTransactionPeerAPI'}});
  add('affiliate-income', {...incoming, starref_commission_permille: 125});
  add('affiliate-payment', {starref_commission_permille: 125, starref_peer: affiliate, starref_amount: {_: 'starsAmount', amount: 1, nanos: 250000000}});
  add('giveaway', {...incoming, giveaway_post_id: msgId});
  add('noid-prize', {...incoming, id: '', giveaway_post_id: msgId});
  add('business', {pFlags: {business_transfer: true}}, true);
  add('ads-proceeds', {...incoming, ads_proceeds_from_date: 1717027200, ads_proceeds_to_date: 1717113600, peer: {_: 'starsTransactionPeerAds'}}, true);
  add('balance-gift-sent', {pFlags: {gift: true}}, true);
  add('balance-gift-received', {...incoming, pFlags: {gift: true}}, true);
  add('noid-gift-sent', {id: '', pFlags: {gift: true}}, true);
  add('noid-gift-received', {...incoming, id: '', pFlags: {gift: true}}, true);
  add('gift-sent', {stargift: gift});
  add('gift-converted', {...incoming, stargift: gift});
  add('gift-refund', {...incoming, stargift: gift, pFlags: {refund: true}});
  add('gift-conversion-refund', {stargift: gift, pFlags: {refund: true}});
  add('auction', {stargift: gift, pFlags: {stargift_auction_bid: true}});
  add('auction-refund', {...incoming, stargift: gift, pFlags: {stargift_auction_bid: true, refund: true}});
  add('upgrade', {stargift: uniqueGift, pFlags: {stargift_upgrade: true}, msg_id: msgId});
  add('upgrade-refund', {...incoming, stargift: uniqueGift, pFlags: {stargift_upgrade: true, refund: true}});
  add('prepaid-upgrade', {stargift: gift, pFlags: {stargift_prepaid_upgrade: true}});
  add('remove-description', {stargift: uniqueGift, pFlags: {stargift_drop_original_details: true}});
  add('gift-transfer', {stargift: uniqueGift}, true);
  add('gift-transfer-refund', {...incoming, stargift: uniqueGift, pFlags: {refund: true}}, true);
  for(const offer of [false, true]) {
    for(const refund of [false, true]) {
      for(const received of [false, true]) {
        add(`${offer ? 'offer' : 'resale'}-${received ? 'income' : 'expense'}${refund ? '-refund' : ''}`, {
          ...(received ? incoming : {}),
          stargift: uniqueGift,
          pFlags: {...(offer ? {offer: true, stargift_resale: true} : {stargift_resale: true}), ...(refund ? {refund: true} : {})},
          starref_commission_permille: 100,
          starref_peer: affiliate,
          starref_amount: {_: 'starsAmount', amount: 1, nanos: 0}
        }, true);
      }
    }
  }
  for(const provider of ['AppStore', 'PlayMarket', 'PremiumBot', 'Fragment', 'Ads', 'API', 'Unsupported']) {
    add(`provider-${provider}`, {...incoming, peer: {_: `starsTransactionPeer${provider}`} as StarsTransactionPeer}, provider === 'Fragment');
  }
  add('withdrawal', {peer: {_: 'starsTransactionPeerFragment'}, transaction_date: 1717200060, transaction_url: 'https://tonviewer.com/sandbox-transaction'}, true);
  add('withdrawal-refund', {...incoming, peer: {_: 'starsTransactionPeerFragment'}, pFlags: {refund: true}}, true);
  for(const status of ['pending', 'failed', 'refund'] as const) add(status, {pFlags: {[status]: true}}, true);
  add('zero', {amount: {_: 'starsAmount', amount: 0, nanos: 0}});
  add('negative-nanostar', {amount: {_: 'starsAmount', amount: 0, nanos: -1}});
  add('int64-gram', {amount: {_: 'starsTonAmount', amount: '9223372036854775807'}});
  return cases;
}
