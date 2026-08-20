import '@helpers/peerIdPolyfill';
import {Message, MessageAction, StarsAmount} from '@layer';
import {getStarGiftActionLangParams} from '@lib/lang';
import I18n from '@lib/langPack';
import lang from '@/lang';

const MY_ID = 1 as PeerId;
const SENDER_ID = 2 as PeerId;
const CHANNEL_ID = (-100) as PeerId;

const STARS: StarsAmount.starsAmount = {_: 'starsAmount', amount: 1500, nanos: 0};
const TON: StarsAmount.starsTonAmount = {_: 'starsTonAmount', amount: 2e9};

function createMessage(action: MessageAction, options: {
  out?: true,
  peerId?: PeerId,
  fromId?: PeerId
}): Message.messageService {
  return {
    _: 'messageService',
    pFlags: {out: options.out},
    peerId: options.peerId,
    fromId: options.fromId,
    action
  } as Message.messageService;
}

function createGift(options: {
  stars?: number,
  actionFromId?: UserId,
  channel?: true,
  upgradeSeparate?: true
} = {}): MessageAction.messageActionStarGift {
  return {
    _: 'messageActionStarGift',
    pFlags: {upgrade_separate: options.upgradeSeparate},
    gift: {_: 'starGift', stars: options.stars ?? 1500} as MessageAction.messageActionStarGift['gift'],
    from_id: options.actionFromId === undefined ? undefined : {_: 'peerUser', user_id: options.actionFromId},
    peer: options.channel ? {_: 'peerChannel', channel_id: '100' as ChatId} : undefined
  };
}

function createUniqueGift(options: {
  resale?: StarsAmount,
  actionFromId?: UserId,
  channel?: true,
  upgrade?: true,
  fromOffer?: true,
  prepaidUpgrade?: true
} = {}): MessageAction.messageActionStarGiftUnique {
  return {
    _: 'messageActionStarGiftUnique',
    pFlags: {
      upgrade: options.upgrade,
      from_offer: options.fromOffer,
      prepaid_upgrade: options.prepaidUpgrade
    },
    gift: {_: 'starGiftUnique'} as MessageAction.messageActionStarGiftUnique['gift'],
    from_id: options.actionFromId === undefined ? undefined : {_: 'peerUser', user_id: options.actionFromId},
    peer: options.channel ? {_: 'peerChannel', channel_id: '100' as ChatId} : undefined,
    resale_amount: options.resale
  };
}

function getParams(message: Message.messageService) {
  return getStarGiftActionLangParams({
    message,
    action: message.action as MessageAction.messageActionStarGift | MessageAction.messageActionStarGiftUnique,
    myId: MY_ID,
    peerTitle: (peerId) => 'peer' + peerId
  });
}

describe('getStarGiftActionLangParams', () => {
  describe('star gift', () => {
    test('names the sender of an incoming gift', () => {
      const message = createMessage(createGift(), {peerId: SENDER_ID, fromId: SENDER_ID});

      expect(getParams(message)).toEqual({
        langPackKey: 'StarGiftSentMessageIncoming',
        args: [1500, 'peer' + SENDER_ID]
      });
    });

    test('drops the name for an outgoing gift', () => {
      const message = createMessage(createGift(), {peerId: SENDER_ID, fromId: MY_ID, out: true});

      expect(getParams(message)).toEqual({langPackKey: 'StarGiftSentMessageOutgoing', args: [1500]});
    });

    test('keeps a gift bought for myself in the self texts', () => {
      const message = createMessage(createGift(), {peerId: MY_ID, fromId: MY_ID, out: true});

      expect(getParams(message)).toEqual({langPackKey: 'StarGiftSentMessageSelf', args: [1500]});
    });

    test('switches to the prepaid upgrade texts', () => {
      const message = createMessage(createGift({upgradeSeparate: true}), {peerId: SENDER_ID, fromId: SENDER_ID});

      expect(getParams(message)).toEqual({
        langPackKey: 'StarGiftSentMessagePrepaidIncoming',
        args: [1500, 'peer' + SENDER_ID]
      });
    });

    test('names both the buyer and the channel for a gift to a channel', () => {
      const message = createMessage(
        createGift({channel: true, actionFromId: SENDER_ID as UserId}),
        {peerId: CHANNEL_ID, fromId: CHANNEL_ID}
      );

      expect(getParams(message)).toEqual({
        langPackKey: 'ActionGiftSentChannel',
        args: [1500, 'peer' + SENDER_ID, 'peer' + CHANNEL_ID]
      });
    });

    test('names only the channel for a gift I sent to it', () => {
      const message = createMessage(createGift({channel: true}), {peerId: CHANNEL_ID, fromId: MY_ID, out: true});

      expect(getParams(message)).toEqual({
        langPackKey: 'ActionGiftSentSelfChannel',
        args: [1500, 'peer' + CHANNEL_ID]
      });
    });
  });

  describe('unique gift', () => {
    test('names the sender of a resold gift somebody bought for me', () => {
      const message = createMessage(
        createUniqueGift({resale: STARS, actionFromId: SENDER_ID as UserId}),
        {peerId: SENDER_ID, fromId: SENDER_ID}
      );

      expect(getParams(message)).toEqual({
        langPackKey: 'StarGiftSentMessageIncoming',
        args: [1500, 'peer' + SENDER_ID]
      });
    });

    test('uses the ton texts for a resold gift paid in grams', () => {
      const message = createMessage(
        createUniqueGift({resale: TON, actionFromId: SENDER_ID as UserId}),
        {peerId: SENDER_ID, fromId: SENDER_ID}
      );

      expect(getParams(message)).toEqual({
        langPackKey: 'StarGiftSentMessageIncomingTon',
        args: [2, 'peer' + SENDER_ID]
      });
    });

    test('drops the name for a resold gift I bought for somebody', () => {
      const message = createMessage(createUniqueGift({resale: STARS}), {peerId: SENDER_ID, fromId: MY_ID, out: true});

      expect(getParams(message)).toEqual({langPackKey: 'StarGiftSentMessageOutgoing', args: [1500]});
    });

    test('drops the name for a resold gift I bought for myself in grams', () => {
      const message = createMessage(
        createUniqueGift({resale: TON, actionFromId: SENDER_ID as UserId}),
        {peerId: MY_ID, fromId: MY_ID}
      );

      expect(getParams(message)).toEqual({langPackKey: 'StarGiftSentMessageSelfTon', args: [2]});
    });

    test('credits me for a gift bought through my own offer', () => {
      const message = createMessage(
        createUniqueGift({resale: STARS, fromOffer: true, actionFromId: SENDER_ID as UserId}),
        {peerId: SENDER_ID, fromId: SENDER_ID}
      );

      expect(getParams(message)).toEqual({langPackKey: 'StarGiftSentMessageSelf', args: [1500]});
    });

    test('credits the buyer for a gift sold through an offer', () => {
      const message = createMessage(
        createUniqueGift({resale: STARS, fromOffer: true}),
        {peerId: SENDER_ID, fromId: MY_ID, out: true}
      );

      expect(getParams(message)).toEqual({langPackKey: 'ActionGiftSold', args: ['peer' + SENDER_ID]});
    });

    test('names both the buyer and the channel for a resold gift bought for a channel', () => {
      const message = createMessage(
        createUniqueGift({resale: STARS, channel: true, actionFromId: SENDER_ID as UserId}),
        {peerId: CHANNEL_ID, fromId: CHANNEL_ID}
      );

      expect(getParams(message)).toEqual({
        langPackKey: 'ActionGiftSentChannel',
        args: [1500, 'peer' + SENDER_ID, 'peer' + CHANNEL_ID]
      });
    });

    test('names the channel a gift was transferred to', () => {
      const message = createMessage(
        createUniqueGift({channel: true, actionFromId: SENDER_ID as UserId}),
        {peerId: CHANNEL_ID, fromId: CHANNEL_ID}
      );

      expect(getParams(message)).toEqual({
        langPackKey: 'ActionGiftTransferredChannel',
        args: ['peer' + SENDER_ID, 'peer' + CHANNEL_ID]
      });
    });

    test('names the channel a gift was upgraded for', () => {
      const message = createMessage(
        createUniqueGift({channel: true, upgrade: true}),
        {peerId: CHANNEL_ID, fromId: MY_ID, out: true}
      );

      expect(getParams(message)).toEqual({
        langPackKey: 'ActionGiftUpgradedSelfChannel',
        args: ['peer' + CHANNEL_ID]
      });
    });

    test('tells who helped to upgrade the gift', () => {
      const message = createMessage(
        createUniqueGift({prepaidUpgrade: true, actionFromId: MY_ID as UserId}),
        {peerId: SENDER_ID, fromId: SENDER_ID}
      );

      expect(getParams(message)).toEqual({
        langPackKey: 'ActionGiftUpgradedHelped',
        args: ['peer' + SENDER_ID]
      });
    });

    test('tells whose help unpacked my gift', () => {
      const message = createMessage(
        createUniqueGift({prepaidUpgrade: true}),
        {peerId: SENDER_ID, fromId: MY_ID, out: true}
      );

      expect(getParams(message)).toEqual({
        langPackKey: 'ActionGiftUpgradedHelpedSelf',
        args: ['peer' + SENDER_ID]
      });
    });

    test('keeps a transfer inside my own dialog impersonal', () => {
      const message = createMessage(
        createUniqueGift({actionFromId: SENDER_ID as UserId}),
        {peerId: MY_ID, fromId: MY_ID}
      );

      expect(getParams(message)).toEqual({langPackKey: 'ActionGiftTransferredSelf'});
    });

    test('names the peer of an incoming transfer', () => {
      const message = createMessage(createUniqueGift(), {peerId: SENDER_ID, fromId: SENDER_ID});

      expect(getParams(message)).toEqual({
        langPackKey: 'ActionGiftTransferredInbound',
        args: ['peer' + SENDER_ID]
      });
    });

    test('names the peer of an outgoing upgrade', () => {
      const message = createMessage(createUniqueGift({upgrade: true}), {peerId: SENDER_ID, fromId: MY_ID, out: true});

      expect(getParams(message)).toEqual({
        langPackKey: 'ActionGiftUpgradedOutbound',
        args: ['peer' + SENDER_ID]
      });
    });
  });

  describe('rendering', () => {
    const render = (message: Message.messageService) => {
      const {langPackKey, args} = getParams(message);
      const str = (lang as any)[langPackKey];

      return I18n.superFormatter(typeof(str) === 'string' ? str : str.other_value, args as any)
      .map((node) => typeof(node) === 'object' ? ((node as any).outerHTML ?? '') : String(node))
      .join('');
    };

    test('puts the sender and the price of an incoming gift in their slots', () => {
      const message = createMessage(
        createUniqueGift({resale: STARS, actionFromId: SENDER_ID as UserId}),
        {peerId: SENDER_ID, fromId: SENDER_ID}
      );

      expect(render(message)).toBe('<b>peer2</b> sent you a gift for <b>1500 Stars</b>');
    });

    test('puts the sender and the price of an incoming gift paid in grams in their slots', () => {
      const message = createMessage(
        createUniqueGift({resale: TON, actionFromId: SENDER_ID as UserId}),
        {peerId: SENDER_ID, fromId: SENDER_ID}
      );

      expect(render(message)).toBe('<b>peer2</b> sent you a gift for <b>2 Grams</b>');
    });

    test('puts the sender, the channel and the price in their slots', () => {
      const message = createMessage(
        createUniqueGift({resale: STARS, channel: true, actionFromId: SENDER_ID as UserId}),
        {peerId: CHANNEL_ID, fromId: CHANNEL_ID}
      );

      expect(render(message)).toBe('<b>peer2</b> sent a gift to <b>peer-100</b> for <b>1500 Stars</b>');
    });

    test('puts the channel and the price of my own gift in their slots', () => {
      const message = createMessage(createGift({channel: true}), {peerId: CHANNEL_ID, fromId: MY_ID, out: true});

      expect(render(message)).toBe('You sent a gift to <b>peer-100</b> for <b>1500 Stars</b>');
    });

    test('puts the sender and the price of a prepaid upgrade in their slots', () => {
      const message = createMessage(createGift({upgradeSeparate: true}), {peerId: SENDER_ID, fromId: SENDER_ID});

      expect(render(message)).toBe('<b>peer2</b> sent an upgrade worth <b>1500 Stars</b> for your gift');
    });

    // * the plural form is picked from the first argument, so every counted text has to lead with it
    test('leads every counted text with the count', () => {
      const messages = [
        createMessage(createGift(), {peerId: SENDER_ID, fromId: SENDER_ID}),
        createMessage(createGift(), {peerId: SENDER_ID, fromId: MY_ID, out: true}),
        createMessage(createGift(), {peerId: MY_ID, fromId: MY_ID, out: true}),
        createMessage(createGift({upgradeSeparate: true}), {peerId: SENDER_ID, fromId: SENDER_ID}),
        createMessage(createGift({channel: true, actionFromId: SENDER_ID as UserId}), {peerId: CHANNEL_ID, fromId: CHANNEL_ID}),
        createMessage(createGift({channel: true}), {peerId: CHANNEL_ID, fromId: MY_ID, out: true}),
        createMessage(createUniqueGift({resale: STARS, actionFromId: SENDER_ID as UserId}), {peerId: SENDER_ID, fromId: SENDER_ID}),
        createMessage(createUniqueGift({resale: STARS}), {peerId: SENDER_ID, fromId: MY_ID, out: true}),
        createMessage(createUniqueGift({resale: STARS, channel: true, actionFromId: SENDER_ID as UserId}), {peerId: CHANNEL_ID, fromId: CHANNEL_ID})
      ];

      for(const message of messages) {
        const {langPackKey, args} = getParams(message);
        if(typeof((lang as any)[langPackKey]) === 'string') { // not a counted text
          continue;
        }

        expect([langPackKey, typeof(args?.[0])]).toEqual([langPackKey, 'number']);
      }
    });
  });
});
