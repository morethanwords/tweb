import {isRestricted} from '../../../../helpers/restrictions';
import {Message} from '../../../../layer';

export default function isMessageRestricted(message: Message.message) {
  return !!(message.restriction_reason && isRestricted(message.restriction_reason));
}
