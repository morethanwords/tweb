import assumeType from '../../../../helpers/assumeType';
import {Message} from '../../../../layer';

export default function getGroupedText(messages: Message.message[]) {
  let foundMessages = 0, message: Message.message;
  for(const m of messages) {
    assumeType<Message.message>(m);
    if(m.message) {
      if(++foundMessages > 1) break;
      message = m;
    }
  }

  if(foundMessages > 1) {
    message = undefined;
  }

  return message;
}
