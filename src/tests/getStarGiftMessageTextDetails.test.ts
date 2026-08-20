import '@helpers/peerIdPolyfill';
import {Message, MessageAction} from '@layer';
import getStarGiftMessageTextDetails from '@appManagers/utils/gifts/getStarGiftMessageTextDetails';

const MY_ID = 1 as PeerId;
const SENDER_ID = 2 as PeerId;

function createMessage(options: {
  out?: true,
  peerId?: PeerId,
  fromId?: PeerId,
  actionFromId?: UserId,
  prepaidUpgrade?: true
}): Message.messageService {
  const action: MessageAction.messageActionStarGift = {
    _: 'messageActionStarGift',
    pFlags: {prepaid_upgrade: options.prepaidUpgrade},
    gift: {_: 'starGift'} as MessageAction.messageActionStarGift['gift'],
    from_id: options.actionFromId === undefined ? undefined : {
      _: 'peerUser',
      user_id: options.actionFromId
    }
  };

  return {
    _: 'messageService',
    pFlags: {out: options.out},
    peer_id: {_: 'peerUser', user_id: options.peerId as UserId},
    peerId: options.peerId,
    fromId: options.fromId,
    action
  } as Message.messageService;
}

function createUniqueMessage(options: {
  out?: true,
  peerId?: PeerId,
  fromId?: PeerId,
  actionFromId?: UserId,
  resale?: boolean,
  fromOffer?: true
}): Message.messageService {
  const action: MessageAction.messageActionStarGiftUnique = {
    _: 'messageActionStarGiftUnique',
    pFlags: {from_offer: options.fromOffer},
    gift: {_: 'starGiftUnique'} as MessageAction.messageActionStarGiftUnique['gift'],
    from_id: options.actionFromId === undefined ? undefined : {
      _: 'peerUser',
      user_id: options.actionFromId
    },
    resale_amount: options.resale ? {_: 'starsAmount', amount: 1000, nanos: 0} : undefined
  };

  return {
    _: 'messageService',
    pFlags: {out: options.out},
    peer_id: {_: 'peerUser', user_id: options.peerId as UserId},
    peerId: options.peerId,
    fromId: options.fromId,
    action
  } as Message.messageService;
}

function getDetails(message: Message.messageService) {
  return getStarGiftMessageTextDetails(
    message,
    message.action as MessageAction.messageActionStarGift | MessageAction.messageActionStarGiftUnique,
    MY_ID
  );
}

describe('getStarGiftMessageTextDetails', () => {
  test('uses the explicit sender for an incoming gift stored in the self dialog', () => {
    const message = createMessage({
      peerId: MY_ID,
      fromId: MY_ID,
      actionFromId: SENDER_ID as UserId
    });

    expect(getDetails(message)).toEqual({direction: 'incoming', fromId: SENDER_ID});
  });

  test('keeps a gift bought for self classified as self', () => {
    const message = createMessage({peerId: MY_ID, fromId: MY_ID, out: true});

    expect(getDetails(message)).toEqual({direction: 'self', fromId: MY_ID});
  });

  test('keeps prepaid upgrade sender semantics based on the message author', () => {
    const message = createMessage({
      peerId: SENDER_ID,
      fromId: SENDER_ID,
      actionFromId: MY_ID as UserId,
      prepaidUpgrade: true
    });

    expect(getDetails(message)).toEqual({direction: 'incoming', fromId: SENDER_ID});
  });

  test('treats a resold gift someone bought for me as incoming', () => {
    const message = createUniqueMessage({
      peerId: SENDER_ID,
      fromId: SENDER_ID,
      actionFromId: SENDER_ID as UserId,
      resale: true
    });

    expect(getDetails(message)).toEqual({direction: 'incoming', fromId: SENDER_ID});
  });

  test('treats a resold gift I bought for someone as outgoing', () => {
    const message = createUniqueMessage({
      peerId: SENDER_ID,
      fromId: MY_ID,
      resale: true,
      out: true
    });

    expect(getDetails(message)).toEqual({direction: 'outgoing', fromId: MY_ID});
  });

  test('treats a resold gift I bought for myself as self even when it comes from its previous owner', () => {
    const message = createUniqueMessage({
      peerId: MY_ID,
      fromId: MY_ID,
      actionFromId: SENDER_ID as UserId,
      resale: true
    });

    expect(getDetails(message)).toEqual({direction: 'self', fromId: SENDER_ID});
  });

  test('treats a resold gift I bought and kept as self when it is sent by me', () => {
    const message = createUniqueMessage({
      peerId: MY_ID,
      fromId: MY_ID,
      resale: true,
      out: true
    });

    expect(getDetails(message)).toEqual({direction: 'self', fromId: MY_ID});
  });

  test('keeps a transferred gift in the self dialog out of the resale texts', () => {
    const message = createUniqueMessage({
      peerId: MY_ID,
      fromId: MY_ID,
      actionFromId: SENDER_ID as UserId
    });

    expect(getDetails(message)).toEqual({direction: 'incoming', fromId: SENDER_ID});
  });

  test('treats a gift bought through my own offer as self', () => {
    const message = createUniqueMessage({
      peerId: SENDER_ID,
      fromId: SENDER_ID,
      actionFromId: SENDER_ID as UserId,
      resale: true,
      fromOffer: true
    });

    expect(getDetails(message)).toEqual({direction: 'self', fromId: SENDER_ID});
  });

  test('treats a gift sold through an offer as outgoing', () => {
    const message = createUniqueMessage({
      peerId: SENDER_ID,
      fromId: MY_ID,
      resale: true,
      fromOffer: true,
      out: true
    });

    expect(getDetails(message)).toEqual({direction: 'outgoing', fromId: MY_ID});
  });
});
