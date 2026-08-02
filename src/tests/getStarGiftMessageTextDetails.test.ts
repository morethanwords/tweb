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

describe('getStarGiftMessageTextDetails', () => {
  test('uses the explicit sender for an incoming gift stored in the self dialog', () => {
    const message = createMessage({
      peerId: MY_ID,
      fromId: MY_ID,
      actionFromId: SENDER_ID as UserId
    });

    expect(getStarGiftMessageTextDetails(
      message,
      message.action as MessageAction.messageActionStarGift,
      MY_ID
    )).toEqual({direction: 'incoming', fromId: SENDER_ID});
  });

  test('keeps a gift bought for self classified as self', () => {
    const message = createMessage({peerId: MY_ID, fromId: MY_ID, out: true});

    expect(getStarGiftMessageTextDetails(
      message,
      message.action as MessageAction.messageActionStarGift,
      MY_ID
    )).toEqual({direction: 'self', fromId: MY_ID});
  });

  test('keeps prepaid upgrade sender semantics based on the message author', () => {
    const message = createMessage({
      peerId: SENDER_ID,
      fromId: SENDER_ID,
      actionFromId: MY_ID as UserId,
      prepaidUpgrade: true
    });

    expect(getStarGiftMessageTextDetails(
      message,
      message.action as MessageAction.messageActionStarGift,
      MY_ID
    )).toEqual({direction: 'incoming', fromId: SENDER_ID});
  });
});
