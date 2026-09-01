/*
 * Network-free fixtures for the popup sandbox.
 *
 * Everything here is a plain MTProto-shaped object — no manager, no worker, no request. The peers
 * land in `apiManagerProxy`'s mirrors (see `environment.ts`), so the synchronous lookups the UI
 * does (`apiManagerProxy.getUser` / `getChat` / `getMessageByPeer`) resolve without a round trip.
 */

import type {
  Chat,
  Dialog,
  Document,
  HelpPremiumPromo,
  Message,
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
  User,
  WebPage
} from '@layer';
import {MESSAGE_ID_OFFSET} from '@appManagers/constants';

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
  [MEGAGROUP_PEER_ID]: megagroupChat
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
  ownerId: SELF_PEER_ID
};

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
  input: {_: 'inputSavedStarGiftUser' as const, msg_id: PRIVATE_MID}
};

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
  destroyMiddlewareHelper: () => {},
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
