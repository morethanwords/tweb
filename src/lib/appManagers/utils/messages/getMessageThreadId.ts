import {Message} from '@layer';
import {GENERAL_TOPIC_ID} from '@appManagers/constants';
import getPeerId from '@appManagers/utils/peers/getPeerId';


type Options = {
  isForum?: boolean;
  isBotforum?: boolean;
};

export default function getMessageThreadId(message: Message.message | Message.messageService, {isForum = false, isBotforum = false}: Options = {}) {
  let threadId: number;
  const replyTo = message.reply_to;
  const savedPeerId = (message as Message.message).saved_peer_id && getPeerId((message as Message.message).saved_peer_id);
  if(savedPeerId) {
    threadId = savedPeerId;
  } else if(replyTo?._ === 'messageReplyHeader' && (!isForum && !isBotforum || replyTo.pFlags.forum_topic)) {
    threadId = replyTo.reply_to_top_id || replyTo.reply_to_msg_id;
  } else if(isForum || isBotforum) {
    if(message._ === 'messageService' && message.action?._ === 'messageActionTopicCreate') {
      threadId = message.mid;
    } else if(isForum) {
      threadId = GENERAL_TOPIC_ID;
    }
  }

  return threadId;
}
