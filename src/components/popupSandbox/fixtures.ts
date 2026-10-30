/*
 * Network-free fixtures for the popup sandbox.
 *
 * Everything here is a plain MTProto-shaped object — no manager, no worker, no request. The peers
 * land in `apiManagerProxy`'s mirrors (see `environment.ts`), so the synchronous lookups the UI
 * does (`apiManagerProxy.getUser` / `getChat` / `getMessageByPeer`) resolve without a round trip.
 */

import type {
  WalletTransaction,
  AiComposeToneExample,
  Chat,
  Dialog,
  Document,
  HelpPremiumPromo,
  Message,
  PaymentRequestedInfo,
  PaymentsPaymentForm,
  PaymentsValidatedRequestedInfo,
  Photo,
  PremiumBoostsStatus,
  PremiumGiftCodeOption,
  AccountPassword,
  PaymentsCheckedGiftCode,
  PaymentsUniqueStarGiftValueInfo,
  PremiumMyBoosts,
  StoryItem,
  ShippingOption,
  StarGift,
  StarsAmount,
  StarsGiveawayOption,
  User,
  WalletNftItem,
  WebDocument,
  WebPage
} from '@layer';
import {MESSAGE_ID_OFFSET} from '@appManagers/constants';
import type {PopupStoryContext} from './context';
import type {MyStarGift} from '@appManagers/appGiftsManager';
import type {WalletCustodyRecord} from '@lib/wallet/vault';
import {getMiddleware} from '@helpers/middleware';

export const SELF_USER_ID = 777001;
export const CONTACT_USER_ID = 777002;
export const PREMIUM_USER_ID = 777003;
export const BOT_USER_ID = 777004;
export const DELETED_USER_ID = 777005;

export const GROUP_CHAT_ID = 888001;
export const CHANNEL_ID = 888002;
export const MEGAGROUP_ID = 888003;

export const SELF_PEER_ID = SELF_USER_ID.toPeerId(false);
export const CONTACT_PEER_ID = CONTACT_USER_ID.toPeerId(false);
export const PREMIUM_PEER_ID = PREMIUM_USER_ID.toPeerId(false);
export const BOT_PEER_ID = BOT_USER_ID.toPeerId(false);
export const DELETED_PEER_ID = DELETED_USER_ID.toPeerId(false);
export const GROUP_PEER_ID = GROUP_CHAT_ID.toPeerId(true);
export const CHANNEL_PEER_ID = CHANNEL_ID.toPeerId(true);
export const MEGAGROUP_PEER_ID = MEGAGROUP_ID.toPeerId(true);

/** Fixed so the sandbox renders the same dates on every run (screenshot diffing, snapshots). */
export const NOW = 1717200000; // 2024-06-01 00:00:00 UTC

const makeUser = (user: Omit<User.user, '_' | 'pFlags'> & Partial<Pick<User.user, 'pFlags'>>): User.user => ({
  _: 'user',
  pFlags: {},
  ...user
});

export const selfUser = makeUser({
  id: SELF_USER_ID,
  access_hash: '1',
  first_name: 'Sandbox',
  last_name: 'Me',
  username: 'sandbox_me',
  phone: '79001234567',
  photo: {_: 'userProfilePhotoEmpty'},
  pFlags: {self: true, premium: true}
});

export const contactUser = makeUser({
  id: CONTACT_USER_ID,
  access_hash: '2',
  first_name: 'Alice',
  last_name: 'Anderson',
  username: 'alice',
  phone: '79007654321',
  photo: {_: 'userProfilePhotoEmpty'},
  pFlags: {contact: true, mutual_contact: true}
});

export const premiumUser = makeUser({
  id: PREMIUM_USER_ID,
  access_hash: '3',
  first_name: 'Bob',
  last_name: 'Premium',
  username: 'bob',
  photo: {_: 'userProfilePhotoEmpty'},
  pFlags: {contact: true, premium: true, verified: true}
});

export const botUser = makeUser({
  id: BOT_USER_ID,
  access_hash: '4',
  first_name: 'Sandbox Bot',
  username: 'sandbox_bot',
  photo: {_: 'userProfilePhotoEmpty'},
  pFlags: {bot: true}
});

export const deletedUser = makeUser({
  id: DELETED_USER_ID,
  access_hash: '5',
  first_name: 'Deleted Account',
  pFlags: {deleted: true}
});

/** More people for the video chat stories, whose grids only show their layouts with a crowd. */
export const videoChatUsers = [
  ['Carol', 'Clark'],
  ['Dave', 'Davis'],
  ['Erin', 'Evans'],
  ['Frank', 'Foster'],
  ['Grace', 'Green'],
  ['Heidi', 'Hill'],
  ['Ivan', 'Ivanov'],
  ['Judy', 'Jones']
].map(([first_name, last_name], index) => makeUser({
  id: 777011 + index,
  access_hash: '' + (11 + index),
  first_name,
  last_name,
  photo: {_: 'userProfilePhotoEmpty'}
}));

export const groupChat: Chat.chat = {
  _: 'chat',
  pFlags: {creator: true},
  id: GROUP_CHAT_ID,
  title: 'Sandbox Group',
  photo: {_: 'chatPhotoEmpty'},
  participants_count: 4,
  date: NOW - 86400 * 30,
  version: 1
};

export const channelChat: Chat.channel = {
  _: 'channel',
  pFlags: {broadcast: true, creator: true},
  id: CHANNEL_ID,
  access_hash: '6',
  title: 'Sandbox Channel',
  username: 'sandbox_channel',
  photo: {_: 'chatPhotoEmpty'},
  participants_count: 12345,
  date: NOW - 86400 * 90
};

export const megagroupChat: Chat.channel = {
  _: 'channel',
  pFlags: {megagroup: true, creator: true},
  id: MEGAGROUP_ID,
  access_hash: '7',
  title: 'Sandbox Supergroup',
  username: 'sandbox_supergroup',
  photo: {_: 'chatPhotoEmpty'},
  participants_count: 250,
  date: NOW - 86400 * 60,
  // The permissions editor reads this straight off the mirrored chat and crashes without it.
  default_banned_rights: {_: 'chatBannedRights', pFlags: {}, until_date: 0}
};

export const peers = {
  [SELF_PEER_ID]: selfUser,
  [CONTACT_PEER_ID]: contactUser,
  [PREMIUM_PEER_ID]: premiumUser,
  [BOT_PEER_ID]: botUser,
  [DELETED_PEER_ID]: deletedUser,
  [GROUP_PEER_ID]: groupChat,
  [CHANNEL_PEER_ID]: channelChat,
  [MEGAGROUP_PEER_ID]: megagroupChat,
  ...Object.fromEntries(videoChatUsers.map((user) => [user.id.toPeerId(false), user]))
} as {[peerId: PeerId]: User.user | Chat};

/** A legacy (private-chat) mid; the mirror keeps these in the global history storage. */
export const PRIVATE_MID = 1001;
/** A channel mid has to live above the offset — that is what routes it to the peer's own storage. */
export const CHANNEL_MID = MESSAGE_ID_OFFSET + 1;

type MessageOverrides = Partial<Message.message> & {mid?: number, peerId?: PeerId};

export function makeMessage(overrides: MessageOverrides = {}): Message.message {
  const {mid = PRIVATE_MID, peerId = CONTACT_PEER_ID, ...rest} = overrides;
  const isChat = peerId < 0;
  return {
    _: 'message',
    pFlags: {},
    id: mid,
    mid,
    peerId,
    fromId: isChat ? CONTACT_PEER_ID : peerId,
    peer_id: isChat ?
      {_: 'peerChannel', channel_id: (-peerId).toString()} :
      {_: 'peerUser', user_id: peerId.toString()},
    from_id: {_: 'peerUser', user_id: (isChat ? CONTACT_USER_ID : peerId).toString()},
    date: NOW - 3600,
    message: 'Hello from the popup sandbox 👋',
    ...rest
  } as Message.message;
}

export const textMessage = makeMessage();

export const outgoingMessage = makeMessage({
  mid: PRIVATE_MID + 1,
  fromId: SELF_PEER_ID,
  from_id: {_: 'peerUser', user_id: SELF_USER_ID.toString()},
  pFlags: {out: true},
  message: 'And one of my own messages'
});

export const channelMessage = makeMessage({
  mid: CHANNEL_MID,
  peerId: CHANNEL_PEER_ID,
  message: 'A channel post',
  views: 4321
});

export const messages: Message.message[] = [textMessage, outgoingMessage, channelMessage];

export const photo: Photo.photo = {
  _: 'photo',
  pFlags: {},
  id: '9001',
  access_hash: '9001',
  file_reference: new Uint8Array(0),
  date: NOW - 7200,
  sizes: [{_: 'photoSize', type: 'x', w: 800, h: 600, size: 40000}],
  dc_id: 2
};

export const audioDocument: Document.document = {
  _: 'document',
  pFlags: {},
  id: '9101',
  access_hash: '9101',
  file_reference: new Uint8Array(0),
  date: NOW - 7200,
  mime_type: 'audio/mpeg',
  size: 4 * 1024 * 1024,
  thumbs: [],
  dc_id: 2,
  attributes: [{
    _: 'documentAttributeAudio',
    pFlags: {},
    duration: 214,
    title: 'Sandbox Track',
    performer: 'Mock Artist'
  }]
};

export const webPage: WebPage.webPage = {
  _: 'webPage',
  pFlags: {},
  id: '9201',
  url: 'https://telegram.org/',
  display_url: 'telegram.org',
  hash: 0,
  type: 'telegram_channel',
  site_name: 'Telegram',
  title: 'Telegram Messenger',
  description: 'Fast. Secure. Powerful.'
};

/**
 * A static-sticker document. Nothing can download it here, so it renders as its placeholder — which
 * is all a popup layout needs, and keeps the fixture free of any binary payload.
 */
export const stickerDocument: Document.document = {
  _: 'document',
  pFlags: {},
  id: '9301',
  access_hash: '9301',
  file_reference: new Uint8Array(0),
  date: NOW - 86400,
  mime_type: 'image/webp',
  size: 24 * 1024,
  thumbs: [],
  dc_id: 2,
  type: 'sticker',
  sticker: 1,
  stickerEmojiRaw: '🎁',
  w: 512,
  h: 512,
  attributes: [
    {_: 'documentAttributeSticker', pFlags: {}, alt: '🎁', stickerset: {_: 'inputStickerSetEmpty'}},
    {_: 'documentAttributeImageSize', w: 512, h: 512}
  ]
};

/**
 * An animated (TGS) sticker. Gift models are always animated, and the upgrade popup casts the
 * wrapped result to a `LottiePlayer` — a static document there resolves to an `<img>` and crashes it.
 */
export const animatedStickerDocument: Document.document = {
  ...stickerDocument,
  id: '9302',
  access_hash: '9302',
  mime_type: 'application/x-tgsticker',
  sticker: 2,
  animated: true
};

export const documents = {
  audio: audioDocument,
  sticker: stickerDocument,
  animatedSticker: animatedStickerDocument
};

const rarity = (permille: number) => ({_: 'starGiftAttributeRarity' as const, permille});

export const starGift: StarGift.starGift = {
  _: 'starGift',
  pFlags: {limited: true},
  id: '7001',
  title: 'Sandbox Gift',
  sticker: stickerDocument,
  stars: 500,
  convert_stars: 400,
  upgrade_stars: 250,
  resell_min_stars: 700,
  availability_remains: 1200,
  availability_total: 5000
};

export const uniqueStarGift: StarGift.starGiftUnique = {
  _: 'starGiftUnique',
  pFlags: {},
  id: '7002',
  gift_id: '7001',
  title: 'Sandbox Gift',
  slug: 'SandboxGift-7',
  num: 7,
  owner_id: {_: 'peerUser', user_id: SELF_USER_ID.toString()},
  availability_issued: 42,
  availability_total: 5000,
  resell_amount: [{_: 'starsAmount', amount: 900, nanos: 0}],
  offer_min_stars: 500,
  value_amount: 1200,
  value_currency: 'XTR',
  attributes: [
    {_: 'starGiftAttributeModel', pFlags: {}, name: 'Cobalt', document: animatedStickerDocument, rarity: rarity(15)},
    {
      _: 'starGiftAttributeBackdrop',
      name: 'Midnight',
      backdrop_id: 1,
      center_color: 0x2b5278,
      edge_color: 0x17212b,
      pattern_color: 0x8aa8c4,
      text_color: 0xffffff,
      rarity: rarity(20)
    },
    {_: 'starGiftAttributePattern', name: 'Sparks', document: stickerDocument, rarity: rarity(25)},
    {
      _: 'starGiftAttributeOriginalDetails',
      sender_id: {_: 'peerUser', user_id: CONTACT_USER_ID.toString()},
      recipient_id: {_: 'peerUser', user_id: SELF_USER_ID.toString()},
      date: NOW - 86400 * 3,
      message: {_: 'textWithEntities', text: 'Happy sandboxing!', entities: []}
    }
  ]
};

/** The manager's `wrapGift` shape, spelled out — there is no manager here to run it. */
export const myStarGift = {
  type: 'stargift' as const,
  raw: starGift,
  sticker: stickerDocument,
  isIncoming: true,
  ownerId: SELF_PEER_ID,
  input: {_: 'inputSavedStarGiftUser', msg_id: PRIVATE_MID},
  saved: {
    _: 'savedStarGift',
    pFlags: {},
    gift: starGift,
    from_id: {_: 'peerUser', user_id: CONTACT_USER_ID},
    date: NOW,
    msg_id: PRIVATE_MID,
    convert_stars: starGift.convert_stars
  }
} satisfies MyStarGift;

export const myUniqueStarGift = {
  type: 'stargift' as const,
  raw: uniqueStarGift,
  sticker: stickerDocument,
  isIncoming: true,
  isUpgraded: true,
  ownerId: SELF_PEER_ID,
  resellPriceStars: 900,
  collectibleAttributes: {
    model: uniqueStarGift.attributes[0] as any,
    backdrop: uniqueStarGift.attributes[1] as any,
    pattern: uniqueStarGift.attributes[2] as any,
    original: uniqueStarGift.attributes[3] as any
  },
  input: {_: 'inputSavedStarGiftUser', msg_id: PRIVATE_MID + 2},
  saved: {...myStarGift.saved, gift: uniqueStarGift, msg_id: PRIVATE_MID + 2, transfer_stars: 25}
} satisfies MyStarGift;

/** Peers with a dialog, newest first — what a peer picker or a forward popup lists. */
export const dialogPeerIds: PeerId[] = [
  SELF_PEER_ID,
  CONTACT_PEER_ID,
  PREMIUM_PEER_ID,
  MEGAGROUP_PEER_ID,
  CHANNEL_PEER_ID,
  GROUP_PEER_ID,
  BOT_PEER_ID
];

export const contactPeerIds: PeerId[] = [CONTACT_PEER_ID, PREMIUM_PEER_ID];

export const dialogs: Dialog.dialog[] = dialogPeerIds.map((peerId, index) => ({
  _: 'dialog',
  pFlags: {},
  peerId,
  peer: peerId < 0 ?
    {_: 'peerChannel', channel_id: (-peerId).toString()} :
    {_: 'peerUser', user_id: peerId.toString()},
  top_message: PRIVATE_MID,
  read_inbox_max_id: PRIVATE_MID,
  read_outbox_max_id: PRIVATE_MID,
  unread_count: 0,
  unread_mentions_count: 0,
  unread_reactions_count: 0,
  notify_settings: {_: 'peerNotifySettings'},
  folder_id: 0,
  index_0: dialogPeerIds.length - index
} as any as Dialog.dialog));

export const starsAmount: StarsAmount.starsAmount = {_: 'starsAmount', amount: 1250, nanos: 0};

export const premiumPromo: HelpPremiumPromo.helpPremiumPromo = {
  _: 'help.premiumPromo',
  status_text: 'Sandbox premium promo',
  status_entities: [],
  video_sections: [],
  videos: [],
  period_options: [
    {_: 'premiumSubscriptionOption', pFlags: {}, months: 1, currency: 'EUR', amount: 499, bot_url: ''},
    {_: 'premiumSubscriptionOption', pFlags: {}, months: 12, currency: 'EUR', amount: 3999, bot_url: ''}
  ],
  // The "upgraded stories" slide renders an avatar for `users[0]` and crashes without one.
  users: [premiumUser]
};

export const premiumGiftOptions: PremiumGiftCodeOption.premiumGiftCodeOption[] = [3, 6, 12].map((months) => ({
  _: 'premiumGiftCodeOption',
  users: 1,
  months,
  currency: 'EUR',
  amount: months * 450
}));

export const boostsStatus: PremiumBoostsStatus.premiumBoostsStatus = {
  _: 'premium.boostsStatus',
  pFlags: {},
  level: 2,
  current_level_boosts: 10,
  boosts: 14,
  next_level_boosts: 25,
  gift_boosts: 3,
  boost_url: 'https://t.me/sandbox_channel?boost'
};

export const paymentForm: PaymentsPaymentForm.paymentsPaymentForm = {
  _: 'payments.paymentForm',
  pFlags: {can_save_credentials: true},
  form_id: '5001',
  bot_id: BOT_USER_ID,
  title: 'Sandbox T-shirt',
  description: 'A soft cotton t-shirt with the sandbox logo',
  invoice: {
    _: 'invoice',
    pFlags: {name_requested: true, email_requested: true, shipping_address_requested: true, flexible: true},
    currency: 'EUR',
    prices: [
      {_: 'labeledPrice', label: 'T-shirt', amount: 2500},
      {_: 'labeledPrice', label: 'Shipping', amount: 500}
    ],
    max_tip_amount: 1000,
    suggested_tip_amounts: [100, 200, 500]
  },
  provider_id: '1',
  url: 'https://telegram.org/',
  // A native provider keeps the card popup on its own form. Any other value swaps it for an iframe
  // pointing at `url` — an external request, which the sandbox has no business making.
  native_provider: 'stripe',
  native_params: {_: 'dataJSON', data: JSON.stringify({publishable_key: 'pk_test_sandbox', need_cardholder_name: true, need_country: true, need_zip: true})},
  users: [botUser]
};

export const starsPaymentForm: PaymentsPaymentForm.paymentsPaymentFormStars = {
  _: 'payments.paymentFormStars',
  form_id: '5002',
  bot_id: BOT_USER_ID,
  title: 'Sandbox sticker pack',
  description: 'Unlocks the sandbox pack',
  invoice: {
    _: 'invoice',
    pFlags: {},
    currency: 'XTR',
    prices: [{_: 'labeledPrice', label: 'Pack', amount: 250}]
  },
  users: [botUser]
};

/**
  * What the account saved from an earlier order. The checkout fills its rows from this, and the
  * invoice asks for exactly what it carries — a set the server would accept.
  */
export const savedPaymentInfo: PaymentRequestedInfo = {
  _: 'paymentRequestedInfo',
  name: 'Sandbox Buyer',
  email: 'buyer@example.com',
  shipping_address: {
    _: 'postAddress',
    street_line1: '1 Sandbox Street',
    street_line2: '',
    city: 'Sandboxville',
    state: '',
    country_iso2: 'DE',
    post_code: '10115'
  }
};

export const shippingOptions: ShippingOption.shippingOption[] = [
  {_: 'shippingOption', id: 'standard', title: 'Standard delivery', prices: [{_: 'labeledPrice', label: 'Standard', amount: 500}]},
  {_: 'shippingOption', id: 'express', title: 'Express delivery', prices: [{_: 'labeledPrice', label: 'Express', amount: 1500}]}
];

export const validatedRequestedInfo: PaymentsValidatedRequestedInfo.paymentsValidatedRequestedInfo = {
  _: 'payments.validatedRequestedInfo',
  id: 'sandbox-info',
  shipping_options: shippingOptions
};

export const starGiftUpgradePreview = {
  models: [uniqueStarGift.attributes[0]] as any[],
  backdrops: [uniqueStarGift.attributes[1]] as any[],
  patterns: [uniqueStarGift.attributes[2]] as any[],
  prices: [{_: 'starGiftUpgradePrice' as const, date: NOW - 86400, upgrade_stars: 250}],
  next_prices: [{_: 'starGiftUpgradePrice' as const, date: NOW + 86400, upgrade_stars: 300}]
};

export const starGiftValueInfo: PaymentsUniqueStarGiftValueInfo.paymentsUniqueStarGiftValueInfo = {
  _: 'payments.uniqueStarGiftValueInfo',
  pFlags: {},
  currency: 'XTR',
  value: 1200,
  initial_sale_date: NOW - 86400 * 30,
  initial_sale_stars: 500,
  initial_sale_price: 500,
  last_sale_date: NOW - 86400 * 2,
  last_sale_price: 1100,
  floor_price: 900,
  average_price: 1050,
  listed_count: 12
};

/**
 * Minimal stand-in for `Chat` (the chat controller, not the MTProto peer). The popups that take one
 * only read `peerId` at render time and reach into `input` from their send handlers, so a stub is
 * enough to see the popup — pressing Send inside it is a no-op.
 */
export const chatStub = {
  peerId: CONTACT_PEER_ID,
  threadId: undefined as number,
  type: 'chat',
  getMessageSendingParams: () => ({peerId: CONTACT_PEER_ID}),
  sendReaction: () => Promise.resolve(),
  starsAmount: 0,
  destroyMiddlewareHelper: getMiddleware(),
  input: {
    helperType: undefined as string,
    editMessage: undefined as any,
    messageInputField: undefined as any,
    sendSilent: false,
    scheduleSending: undefined as any,
    isEphemeralComposerMode: () => false,
    getEphemeralCommandResolution: () => ({state: 'none'}) as any,
    getCurrentInputAsDraft: () => undefined as any,
    canSendWhenOnline: () => false,
    getAiEditorContext: () => ({capture: () => ({
      peerId: CONTACT_PEER_ID,
      isCurrent: () => true,
      canSendWhenOnline: () => false,
      clear: () => {}
    })}),
    onAttachClick: () => {},
    resetSendingFlags: () => {},
    setScheduleTimestamp: () => {},
    setDraft: () => {},
    clearHelper: () => {},
    onMessageSent: () => {},
    paidMessageInterceptor: {prepareStarsForPayment: () => Promise.resolve({})}
  }
} as any;

export const userFullWithRating = {
  _: 'userFull' as const,
  pFlags: {},
  id: SELF_USER_ID,
  settings: {_: 'peerSettings' as const, pFlags: {}},
  stars_rating: {_: 'starsRating' as const, level: 4, current_level_stars: 800, stars: 1250, next_level_stars: 2000},
  stars_my_pending_rating: {_: 'starsRating' as const, level: 5, current_level_stars: 2000, stars: 2100, next_level_stars: 4000},
  stars_my_pending_rating_date: NOW + 86400 * 7
} as any;

export const checkedGiftCode: PaymentsCheckedGiftCode.paymentsCheckedGiftCode = {
  _: 'payments.checkedGiftCode',
  pFlags: {},
  from_id: {_: 'peerChannel', channel_id: CHANNEL_ID.toString()},
  to_id: SELF_USER_ID,
  date: NOW - 86400,
  days: 90,
  chats: [channelChat],
  users: [selfUser],
  slug: 'sandbox-gift-code'
};

export const myBoosts: PremiumMyBoosts.premiumMyBoosts = {
  _: 'premium.myBoosts',
  my_boosts: [
    {_: 'myBoost', slot: 1, date: NOW - 86400 * 10, expires: NOW + 86400 * 20},
    {_: 'myBoost', slot: 2, peer: {_: 'peerChannel', channel_id: CHANNEL_ID.toString()}, date: NOW - 86400 * 5, expires: NOW + 86400 * 25}
  ],
  chats: [channelChat],
  users: []
};

export const passwordState: AccountPassword.accountPassword = {
  _: 'account.password',
  pFlags: {has_password: true},
  new_algo: {_: 'passwordKdfAlgoUnknown'},
  new_secure_algo: {_: 'securePasswordKdfAlgoUnknown'},
  secure_random: new Uint8Array(0),
  hint: 'the sandbox hint'
};

export const storyItem: StoryItem.storyItem = {
  _: 'storyItem',
  pFlags: {out: true, pinned: true, public: true},
  id: 1,
  date: NOW - 86400,
  expire_date: NOW + 86400,
  caption: 'A sandbox story',
  media: {_: 'messageMediaPhoto', pFlags: {}, photo},
  albums: [1]
};

export const aiToneExample: AiComposeToneExample = {
  _: 'aiComposeToneExample',
  from: {_: 'textWithEntities', text: 'Hello, friend!', entities: []},
  to: {_: 'textWithEntities', text: 'Ahoy, matey!', entities: []}
};

export const starsGiveawayOptions: StarsGiveawayOption[] = [500, 1000].map((stars) => ({
  _: 'starsGiveawayOption',
  pFlags: {},
  stars,
  yearly_boosts: stars / 100,
  currency: 'EUR',
  amount: stars,
  winners: [1, 5].map((users) => ({
    _: 'starsGiveawayWinnersOption',
    pFlags: {},
    users,
    per_user_stars: stars / users
  }))
}));

export const EMBEDDED_PAGE_URL = 'data:text/html,' + encodeURIComponent('<!doctype html><html lang="en"><head><title>Sandbox embedded page</title></head><body><main><h1>Sandbox embedded page</h1><p>Local fixture. No Telegram traffic.</p></main></body></html>');

// MARK: Wallet

const WALLET_ADDRESS = 'UQA8RRt6mUoTcShtSDlxDvF1SX6Femu9dMCB-ZTK3uQ-aU_k';
// * well-formed (the checksum holds): the engine reads the addresses it is handed, a malformed one fails the flow
export const walletSandboxOtherAddress = 'UQC5Yw1jHf6s6CTr5kn6XgGcAkCq3lWlDYDYp2Dz4TQYJxPv';
export const walletSandboxPublicKey = new Uint8Array(32).map((_, i) => (i * 37 + 11) & 0xff);
const WALLET_NOW = Math.floor(Date.now() / 1000);

function walletState(balance: string, flags: {backup_enabled?: true, can_export_phrase?: true, can_enable_backup?: true} = {backup_enabled: true, can_export_phrase: true}) {
  return {
    _: 'walletState' as const,
    pFlags: flags,
    address: WALLET_ADDRESS,
    public_key: walletSandboxPublicKey,
    balance
  };
}

export function walletSandboxTransactions(userId: UserId): WalletTransaction[] {
  const make = (index: number, amount: string, peer: WalletTransaction['peer'], extra: Partial<WalletTransaction> = {}): WalletTransaction => ({
    _: 'walletTransaction',
    id: `${1000 + index}:sandbox${index}`,
    amount,
    fee: '2749650',
    date: WALLET_NOW - index * 86400 - 3600,
    peer,
    tx_hash: 'k1nYRmyLRn4PvAckJe7Zqta5rEu9phCURNxpD2KYRdw=',
    ...extra,
    pFlags: {incoming: amount.startsWith('-') ? undefined : true, ...extra.pFlags}
  });

  return [
    make(0, '2460000000', {_: 'walletTransactionPeerUser', user_id: userId, address: walletSandboxOtherAddress}, {comment: 'For the coffee ☕️'}),
    make(1, '50150000000', {_: 'walletTransactionPeerOnramp', pFlags: {}, address: walletSandboxOtherAddress, provider_name: 'MoonPay'} as any),
    make(2, '-15460000000', {_: 'walletTransactionPeerUser', user_id: userId, address: walletSandboxOtherAddress}, {pFlags: {gasless: true}}),
    make(3, '-235230000000', {_: 'walletTransactionPeerAddress', pFlags: {}, address: walletSandboxOtherAddress} as any),
    make(4, '120000000000', {_: 'walletTransactionPeerUser', user_id: userId, address: walletSandboxOtherAddress}, {pFlags: {comment_encrypted: true}, comment: 'AAAA'}),
    make(5, '-500000000000', {_: 'walletTransactionPeerAddress', pFlags: {}, address: walletSandboxOtherAddress, domain: 'foundation.ton'} as any, {pFlags: {failed: true}}),
    // * a collectible that went to a user: the row says one item and shows it under itself
    make(6, '-50000000', {_: 'walletTransactionPeerUser', user_id: userId, address: walletSandboxOtherAddress}, {nft: walletSandboxNfts[0]})
  ];
}

export function walletSandboxManagers(options: {
  balance?: string,
  presence?: 'ready' | 'provisioning' | 'unavailable',
  empty?: boolean,
  nfts?: boolean,
  flags?: {backup_enabled?: true, can_export_phrase?: true, can_enable_backup?: true},
  /** what the old wallet on this device holds (`walletSandboxParkedRecord`); without it the chain does not answer */
  parkedNanos?: string,
  /** false: Telegram pays no fee today, every transfer shows its own */
  gasless?: boolean
} = {}) {
  return (ctx: PopupStoryContext) => {
    const presence = options.presence || 'ready';
    const status = {
      presence,
      state: presence === 'ready' ? walletState(options.balance ?? '1720580000000', options.flags) : undefined,
      date: Date.now()
    };

    const list = options.empty ? [] : walletSandboxTransactions(ctx.peer('private').toUserId());
    return {
      appWalletManager: {
        getStatus: () => status,
        getCachedStatus: () => status,
        getTransactions: () => ({_: 'wallet.transactions', pFlags: {}, balance: status.state?.balance, transactions: list, chats: [] as any[], users: [] as any[]}),
        getTransactionsByIds: (ids: string[]) => ({_: 'wallet.transactions', pFlags: {}, transactions: list.filter((item) => ids.includes(item.id)), chats: [] as any[], users: [] as any[]}),
        getTransactionsByMsgHash: () => ({_: 'wallet.transactions', pFlags: {}, transactions: [] as WalletTransaction[], chats: [] as any[], users: [] as any[]}),
        getRates: () => ({rates: {USD: 2.12, EUR: 1.87, GBP: 1.61, RUB: 172.4}, date: Date.now()}),
        getUserAddress: () => ({_: 'walletUserAddress', pFlags: {}, user_id: ctx.peer('private').toUserId(), address: walletSandboxOtherAddress, public_key: walletSandboxPublicKey}),
        getAddressOwner: (): any => undefined,
        getGaslessInfo: () => ({available: options.gasless ?? true, left: 4, reset_at: WALLET_NOW + 86400, min_amount: '100000000', relayer_address: walletSandboxOtherAddress, date: Date.now()}),
        performToncenterRequest: () => Promise.reject({type: 'WALLET_TONCENTER_ERROR', message: 'sandbox'}),
        getAddressFunds: () => options.parkedNanos !== undefined ?
          {nanos: options.parkedNanos, neverUsed: false} :
          Promise.reject({type: 'WALLET_TONCENTER_ERROR', message: 'sandbox'}),
        // * Telegram's provider is there, but no session opens in the sandbox: a moment of the button's spinner, then
        // * the failure alert
        isOnrampAvailable: () => true,
        createOnrampSession: () => new Promise((resolve, reject) => setTimeout(() => reject({type: 'SANDBOX'}), 1500)),
        getNfts: () => ({_: 'wallet.nftItems', items: options.nfts ? walletSandboxNfts : []}),
        getExistingWaltBalance: () => ({_: 'wallet.existingBalance', pFlags: {}, url: ''}),
        // * nothing kept of an earlier window (stories/wallet.ts `wallet/history/*` keep something), and what this one
        // * changes of its "Sending" rows goes nowhere
        getHistoryCache: (): void => undefined,
        getPendingTransfers: (): any[] => [],
        addPendingTransfer: (): void => undefined,
        updatePendingTransfer: (): void => undefined,
        removePendingTransfer: (): void => undefined,
        applyStreamBalance: (): void => undefined
      },
      // * the collectible screen checks a gift's address before it offers to sell it
      appGiftsManager: {
        getGiftBySlug: walletSandboxGiftBySlug
      },
      appUsersManager: {
        getTopPeers: () => [{id: ctx.peer('private'), rating: 1}],
        isRegularUser: () => true
      },
      // * the recipient picker lists people only: users that are not bots
      appPeersManager: {
        isRegularUser: (peerId: PeerId) => peerId.isUser() && peerId !== ctx.peer('bot')
      }
    };
  };
}

/** whose vault the key popups open: nobody's on this device */
export const walletSandboxUserId = 0 as UserId;

/** the key of a wallet used before on this device: the stories lay it over the session's vault, never into it */
export const walletSandboxParkedRecord: WalletCustodyRecord = {
  recordId: 'sandbox-parked',
  // * a well-formed address: the engine reads it to tell it from the served one and to ask what it holds
  address: 'UQAHPHGm2xBFeq_kGU6DuO0iV4zB9itglcr_NGme0wg9ciqH',
  anchorKey: '11'.repeat(32),
  signingKey: '11'.repeat(32),
  secretRef: 'sandbox-parked-secret',
  network: 'mainnet',
  date: WALLET_NOW * 1000 - 30 * 86400e3
};

/** a made-up phrase: the quiz asks three of these back */
export const walletSandboxWords = 'abandon ability able about above absent absorb abstract absurd abuse access accident'.split(' ');

/** the made-up phrase after a key update: the anchor half stays, the signing half is new */
export const walletSandboxRotatedWords = [
  ...walletSandboxWords,
  ...'actor actress actual adapt add addict address adjust admit adult advance advice'.split(' ')
];

/** what a key update costs on the sandbox's chain, nanograms */
export const walletSandboxRotationFee = '4200000';

const WALLET_NFT_ADDRESSES = [
  'EQC5Yw1jHf6s6CTr5kn6XgGcAkCq3lWlDYDYp2Dz4TQYKL_F',
  'EQC5Yw1jHf6s6CTr5kn6XgGcAkCq3lWlDYDYp2Dz4TQYKa_k',
  'EQC5Yw1jHf6s6CTr5kn6XgGcAkCq3lWlDYDYp2Dz4TQYKp-H',
  'EQC5Yw1jHf6s6CTr5kn6XgGcAkCq3lWlDYDYp2Dz4TQYK4-m'
];

// * Fragment's own collections: an item is a username or a number only in these (lib/wallet/nftKind.ts)
const FRAGMENT_USERNAMES = 'EQCA14o1-VWhS2efqoh_9M1b_A9DtKTuoqfmkn83AbJzwnPi';
const FRAGMENT_NUMBERS = 'EQAOQdwdw8kGftJCSFgOErM1mBjYPe4DBPq8-AhF6vr9si5N';

/** a link the client only reads: the kind of a collectible comes from its Fragment URLs */
const walletNftUrl = (url: string): WebDocument => ({_: 'webDocument', url, access_hash: 0, size: 0, attributes: []});
const walletNftTrait = (trait_type: string, value: string) => ({_: 'wallet.nftAttribute' as const, trait_type, value});
/** the metadata the server passes on as JSON */
const walletNftExtra = (value: object) => ({_: 'dataJSON' as const, data: JSON.stringify(value)});

/**
 * Made-up collectibles, one of each kind: a gift, a username, an anonymous number and an NFT that is not
 * Telegram's. No pictures: the sandbox fetches no web files.
 */
export const walletSandboxNfts: WalletNftItem[] = [
  {
    collection_address: walletSandboxOtherAddress,
    name: 'Plush Pepe #12',
    content_url: walletNftUrl('https://nft.fragment.com/gift/plushpepe-12.json'),
    attributes: [walletNftTrait('Model', 'Frog'), walletNftTrait('Backdrop', 'Emerald'), walletNftTrait('Symbol', 'Star')],
    // * the collection line under the name: a link, its page is on Fragment
    extra: walletNftExtra({collection_name: 'Plush Pepes', collection_url: 'https://fragment.com/gifts/plushpepe'})
  },
  {
    collection_address: FRAGMENT_USERNAMES,
    name: '@sandbox',
    content_url: walletNftUrl('https://nft.fragment.com/username/sandbox.json')
  },
  {
    collection_address: FRAGMENT_NUMBERS,
    name: '+888 0000 0007',
    content_url: walletNftUrl('https://nft.fragment.com/number/88800000007.json')
  },
  {
    collection_address: walletSandboxOtherAddress,
    name: 'Sandbox Punk #93',
    description: 'A collectible from the sandbox.',
    attributes: [walletNftTrait('Hat', 'Beanie'), walletNftTrait('Eyes', 'Laser')],
    // * a collection whose page is not on Fragment: named, not linked
    extra: walletNftExtra({collection: {name: 'Sandbox Punks', external_link: 'https://punks.example.com'}})
  }
].map((fields: Partial<WalletNftItem>, index) => ({
  _: 'wallet.nftItem' as const,
  address: WALLET_NFT_ADDRESSES[index],
  owner_address: WALLET_ADDRESS,
  index: String(index),
  ...fields
}));

/**
 * The gift `payments.getUniqueStarGift` names for a collectible's slug: by default the collectible itself, at its
 * own address; `address` puts it elsewhere, as a forged collectible's metadata would.
 */
export function walletSandboxGiftBySlug(slug: string, address?: string): MyStarGift {
  const item = walletSandboxNfts.find((item) => item.content_url?.url.endsWith('/gift/' + slug + '.json'));
  return {
    ...myUniqueStarGift,
    raw: {...uniqueStarGift, slug, gift_address: address ?? item?.address ?? walletSandboxOtherAddress}
  };
}


/** the wallet's own address in the sandbox: a dApp's preview tells what leaves it from what comes back */
export const walletSandboxAddress = WALLET_ADDRESS;

/**
 * Apps connected over TON Connect: made-up manifests without icons (the sandbox fetches no web files), one of them
 * being disconnected by the server
 */
export const walletSandboxTonConnectSessions = [
  {name: 'Fragment', url: 'https://fragment.com', closing: false},
  {name: 'TON Stakers', url: 'https://app.tonstakers.com', closing: false},
  {name: 'Getgems', url: 'https://getgems.io', closing: true}
].map(({name, url, closing}, index) => ({
  _: 'tonConnectSession' as const,
  pFlags: closing ? {closing: true as const} : {},
  id: String(7000 + index),
  dapp_client_id: (index + 1).toString(16).repeat(64).slice(0, 64),
  client_id: 'a8ed199729d5efd0c212c2542fd7d353e692e42c95e7e97a9e47e2569cbe4f61',
  nonce: new Uint8Array(16).fill(index + 1),
  manifest: {_: 'tonConnectManifest' as const, url, name},
  date: WALLET_NOW - index * 86400
}));
