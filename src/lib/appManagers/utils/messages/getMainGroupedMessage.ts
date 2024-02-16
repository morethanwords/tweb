import {Message} from '../../../../layer';

export default function getMainGroupedMessage(messages: Message.message[]) {
  return messages[0];
}
