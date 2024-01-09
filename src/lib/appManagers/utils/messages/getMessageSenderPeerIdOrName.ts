import {Message} from '../../../../layer';
import type {MyMessage} from '../../appMessagesManager';
import getFwdFromName from './getFwdFromName';

export default function getMessageSenderPeerIdOrName(message: MyMessage) {
  if(message.fromId) {
    return {
      peerId: message.fromId
    };
  } else {
    return {
      fromName: getFwdFromName((message as Message.message).fwd_from)
    };
  }
}
