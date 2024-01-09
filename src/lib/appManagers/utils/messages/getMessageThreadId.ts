import {Message} from '../../../../layer';
import {GENERAL_TOPIC_ID} from '../../../mtproto/mtproto_config';
import getPeerId from '../peers/getPeerId';

export default function getMessageThreadId(message: Message.message | Message.messageService, isForum?: boolean) {
  let threadId: number;
  const replyTo = message.reply_to;
  const savedPeerId = (message as Message.message).saved_peer_id && getPeerId((message as Message.message).saved_peer_id);
  if(savedPeerId) {
    threadId = savedPeerId;
  } else if(replyTo?._ === 'messageReplyHeader' && (!isForum || replyTo.pFlags.forum_topic)) {
    threadId = replyTo.reply_to_top_id || replyTo.reply_to_msg_id;
  } else if(isForum) {
    if(message._ === 'messageService' && message.action?._ === 'messageActionTopicCreate') {
      threadId = message.mid;
    } else {
      threadId = GENERAL_TOPIC_ID;
    }
  }

  return threadId;
}
