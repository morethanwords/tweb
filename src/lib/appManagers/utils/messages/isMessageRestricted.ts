import {isRestricted, isSensitive} from '../../../../helpers/restrictions';
import {Message} from '../../../../layer';

export default function isMessageRestricted(message: Message.message) {
  return !!(message.restriction_reason && isRestricted(message.restriction_reason));
}

export function isMessageSensitive(message: Message) {
  return (message._ === 'message' && message.restriction_reason != null && isSensitive(message.restriction_reason));
}
