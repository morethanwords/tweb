import {InputReplyTo} from '../../../../layer';
import getServerMessageId from '../messageId/getServerMessageId';

export default function getInputReplyTo({
  replyToMsgId,
  threadId
}: {
  replyToMsgId?: number,
  threadId?: number
}): InputReplyTo {
  return replyToMsgId || threadId ? {
    _: 'inputReplyToMessage',
    reply_to_msg_id: replyToMsgId ? getServerMessageId(replyToMsgId) : undefined,
    top_msg_id: threadId ? getServerMessageId(threadId) : undefined
  } : undefined
}
