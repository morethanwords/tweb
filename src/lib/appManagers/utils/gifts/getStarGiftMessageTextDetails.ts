import {Message, MessageAction} from '@layer';
import getPeerId from '@appManagers/utils/peers/getPeerId';

export type StarGiftMessageDirection = 'self' | 'outgoing' | 'incoming';

export default function getStarGiftMessageTextDetails(
  message: Pick<Message.messageService, 'pFlags' | 'peerId' | 'fromId'>,
  action: MessageAction.messageActionStarGift | MessageAction.messageActionStarGiftUnique,
  myId: PeerId
): {
  direction: StarGiftMessageDirection,
  fromId: PeerId
} {
  const fromId = !action.pFlags.prepaid_upgrade && action.from_id ?
    getPeerId(action.from_id) :
    message.fromId;

  const uniqueAction = action._ === 'messageActionStarGiftUnique' ? action : undefined;
  const isResale = !!uniqueAction?.resale_amount;

  // * a gift bought through my own offer is paid by me, though it comes from its previous owner
  const boughtThroughOffer = isResale && !!uniqueAction?.pFlags.from_offer && !message.pFlags.out;

  // * a resold gift in my own dialog is always the one I bought for myself, no matter who transferred it
  const direction = boughtThroughOffer || (message.peerId === myId && (isResale || !fromId || fromId === myId)) ?
    'self' :
    message.pFlags.out || fromId === myId ? 'outgoing' : 'incoming';

  return {direction, fromId};
}
