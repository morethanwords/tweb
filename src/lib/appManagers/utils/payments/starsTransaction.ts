import type {StarsAmount, StarsTransaction, StarsTransactionPeer} from '@layer';
import type {LangPackKey} from '@lib/langPack';
import getPeerId from '@appManagers/utils/peers/getPeerId';
import {starsAmountNanounits} from '@appManagers/utils/payments/formatStarsAmount';

export const starsTransactionProviders: Partial<Record<StarsTransactionPeer['_'], LangPackKey>> = {
  starsTransactionPeerAppStore: 'Stars.Transaction.AppStore',
  starsTransactionPeerPlayMarket: 'Stars.Transaction.PlayMarket',
  starsTransactionPeerPremiumBot: 'Stars.Via.Bot',
  starsTransactionPeerFragment: 'Stars.Transaction.Fragment',
  starsTransactionPeerAds: 'Stars.Transaction.Ads',
  starsTransactionPeerAPI: 'Stars.Transaction.API',
  starsTransactionPeerUnsupported: 'Stars.Transaction.Unsupported'
};

/** The sign describes this balance change; a refund reverses the original operation. */
export function getStarsTransactionPresentation(transaction: StarsTransaction) {
  const {pFlags: flags, stargift: gift} = transaction;
  const incoming = !starsAmountNanounits(transaction.amount).isNegative();
  const outgoing = flags.refund ? incoming : !incoming;
  const ton = transaction.amount._ === 'starsTonAmount';
  let kind: string;
  let titleKey: LangPackKey;
  let titleArgs: (string | number)[] = [];
  let icon: Icon = ton ? 'ton' : 'star';
  const set = (type: string, key: LangPackKey, args: (string | number)[] = []) => {
    kind = type;
    titleKey = key;
    titleArgs = args;
  };

  if(flags.stargift_drop_original_details) {
    set('giftDescription', 'Stars.Transaction.GiftDescription');
  } else if(flags.posts_search) {
    set('search', 'Stars.Transaction.Search');
    icon = 'search';
  } else if(transaction.premium_gift_months) {
    set('premium', 'Stars.Transaction.Premium', [transaction.premium_gift_months]);
    icon = 'premium';
  } else if(flags.phonegroup_message || (flags.reaction && transaction.paid_messages && !transaction.msg_id)) {
    set('live', flags.reaction ? 'Stars.Transaction.LiveReaction' : 'Stars.Transaction.LiveMessages', [transaction.paid_messages || 1]);
  } else if(transaction.paid_messages !== undefined) {
    set('messages', 'PaidMessages.FeeForMessages', [transaction.paid_messages]);
  } else if(transaction.floodskip_number !== undefined || transaction.peer._ === 'starsTransactionPeerAPI') {
    set('api', transaction.floodskip_number === undefined ? 'Stars.Transaction.API' : 'Stars.Transaction.Broadcast', [transaction.floodskip_number || 0]);
  } else if(flags.stargift_auction_bid) {
    set('auction', 'Stars.Transaction.Auction');
  } else if(flags.stargift_prepaid_upgrade) {
    set('prepaidUpgrade', 'Stars.Transaction.PrepaidUpgrade');
  } else if(flags.stargift_upgrade) {
    set('upgrade', 'Stars.Transaction.Upgrade');
  } else if(flags.offer) {
    set('offer', outgoing ? 'StarGiftOffer.CreateOfferTitle' : 'Stars.Transaction.GiftSale');
  } else if(flags.stargift_resale || gift?._ === 'starGiftUnique') {
    const resale = flags.stargift_resale || (!outgoing && !starsAmountNanounits(transaction.amount).isZero());
    set(resale ? 'resale' : 'transfer', resale ? (outgoing ? 'Stars.Transaction.GiftPurchase' : 'Stars.Transaction.GiftSale') : 'Stars.Transaction.GiftTransfer');
  } else if(gift) {
    set('gift', outgoing ? 'StarsGiftSent' : 'Stars.Transaction.GiftConverted');
  } else if(transaction.starref_commission_permille !== undefined && !transaction.starref_amount) {
    set('affiliate', 'Stars.Transaction.Commission', [transaction.starref_commission_permille / 10]);
  } else if(flags.business_transfer) {
    set('business', 'Stars.Transaction.BusinessTransfer');
  } else if(transaction.ads_proceeds_from_date !== undefined) {
    set('adsProceeds', 'Stars.Transaction.AdsProceeds');
  } else if(transaction.giveaway_post_id) {
    set('giveaway', 'StarsGiveawayPrizeReceived');
  } else if(transaction.extended_media?.length) {
    set('media', 'StarMediaPurchase');
  } else if(flags.reaction) {
    set('reaction', 'StarsReactionTitle');
  } else if(transaction.subscription_period) {
    set('subscription', transaction.subscription_period === 2592000 ? 'Stars.Subscription.Title' : 'Stars.Transaction.Subscription');
  } else if(flags.gift) {
    set('starsGift', outgoing ? 'StarsGiftSent' : 'StarsGiftReceived');
  } else if(transaction.peer._ === 'starsTransactionPeerFragment') {
    set(outgoing ? 'withdrawal' : 'topup', outgoing ? 'Stars.Transaction.Withdrawal' : ton ? 'Stars.Transaction.GramTopup' : 'Stars.TopUp');
  } else if(transaction.peer._ === 'starsTransactionPeerAds') {
    set('ads', 'Stars.Transaction.Ads');
  } else if(transaction.peer._ === 'starsTransactionPeerUnsupported') {
    set('unsupported', 'Stars.Transaction.Unsupported');
  } else if(transaction.peer._ !== 'starsTransactionPeer') {
    set('topup', ton ? 'Stars.Transaction.GramTopup' : 'Stars.TopUp');
  } else {
    set('payment', 'Stars.Transaction.Payment');
  }

  const statusKey: LangPackKey = flags.refund ? 'StarsRefunded' : flags.failed ? 'StarsFailed' : flags.pending ? 'StarsPending' : undefined;
  const anonymousGift = kind === 'starsGift' && !ton && transaction.peer._ === 'starsTransactionPeerFragment';
  return {kind, titleKey, titleArgs, icon, incoming, outgoing, ton, statusKey, anonymousGift};
}

/** Gross income is the credited amount plus its fee; old resale receipts provide only a rate. */
export function getStarsTransactionFullAmount(transaction: StarsTransaction): StarsAmount | undefined {
  const {kind, incoming} = getStarsTransactionPresentation(transaction);
  if(!incoming || transaction.pFlags.refund || !['messages', 'live', 'resale', 'offer'].includes(kind)) return;

  const net = starsAmountNanounits(transaction.amount);
  let full = net;
  if(transaction.starref_amount) {
    if(transaction.starref_amount._ !== transaction.amount._) return;
    const fee = starsAmountNanounits(transaction.starref_amount);
    if(fee.isNegative()) return;
    full = net.add(fee);
  } else {
    const rate = transaction.starref_commission_permille;
    if(!['resale', 'offer'].includes(kind) || !Number.isInteger(rate) || rate < 0 || rate >= 1000) return;
    const denominator = 1000 - rate;
    full = net.multiply(1000).add(Math.floor(denominator / 2)).divide(denominator);
  }

  if(transaction.amount._ === 'starsTonAmount') return {_: 'starsTonAmount', amount: full.toString()};
  const {quotient, remainder} = full.divmod(1e9);
  return {_: 'starsAmount', amount: quotient.toString(), nanos: remainder.toJSNumber()};
}

/** Message/media belong to the seller's ledger for incoming sales, not the buyer's chat. */
export function getStarsTransactionMessagePeerId(transaction: StarsTransaction, ownerPeerId: PeerId, selfPeerId?: PeerId) {
  const peerId = transaction.peer._ === 'starsTransactionPeer' ? getPeerId(transaction.peer.peer) : undefined;
  if(transaction.giveaway_post_id) return peerId;
  const incoming = !starsAmountNanounits(transaction.amount).isNegative();
  const receivedPayment = transaction.pFlags.refund ? !incoming : incoming;
  return receivedPayment && ownerPeerId !== selfPeerId && (transaction.pFlags.reaction || transaction.extended_media?.length || transaction.paid_messages !== undefined) ? ownerPeerId : peerId;
}
