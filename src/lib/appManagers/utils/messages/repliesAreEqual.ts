import {MessageReplyHeader} from '../../../../layer';

export default function repliesAreEqual(reply1: MessageReplyHeader, reply2: MessageReplyHeader) {
  if(reply1?._ !== 'messageReplyHeader' || reply2?._ !== 'messageReplyHeader') {
    return false;
  }

  if(reply1.reply_to_msg_id !== reply2.reply_to_msg_id) {
    return false;
  }

  return true;
}
