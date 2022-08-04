import {Message} from '../../../../layer';
import type {MyMessage} from '../../appMessagesManager';

export default function getMessageSenderPeerIdOrName(message: MyMessage) {
  if(message.fromId) {
    return {
      peerId: message.fromId
    };
  } else {
    return {
      fromName: (message as Message.message).fwd_from?.from_name
    };
  }
}
