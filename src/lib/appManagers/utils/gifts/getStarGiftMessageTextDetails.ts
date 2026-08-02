import {Message, MessageAction} from '@layer';
import getPeerId from '@appManagers/utils/peers/getPeerId';

export type StarGiftMessageDirection = 'self' | 'outgoing' | 'incoming';

export default function getStarGiftMessageTextDetails(
  message: Pick<Message.messageService, 'pFlags' | 'peerId' | 'fromId'>,
  action: MessageAction.messageActionStarGift,
  myId: PeerId
): {
  direction: StarGiftMessageDirection,
  fromId: PeerId
} {
  const fromId = !action.pFlags.prepaid_upgrade && action.from_id ?
    getPeerId(action.from_id) :
    message.fromId;

  const direction = message.peerId === myId && (!fromId || fromId === myId) ?
    'self' :
    message.pFlags.out || fromId === myId ? 'outgoing' : 'incoming';

  return {direction, fromId};
}
