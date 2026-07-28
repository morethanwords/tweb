import type {AdminLog} from '@appManagers/appChatsManager';
import type {MyMessage} from '@appManagers/appMessagesManager';
import isEphemeralMessage from '@appManagers/utils/messages/isEphemeralMessage';

function getMessageId(message: MyMessage | AdminLog) {
  return message._ === 'channelAdminLogEvent' ? +message.id : message.mid;
}

export default function compareBubbleTimelineMessages(
  message1: MyMessage | AdminLog,
  message2: MyMessage | AdminLog
) {
  const isEphemeral1 = isEphemeralMessage(message1);
  const isEphemeral2 = isEphemeralMessage(message2);
  if(!isEphemeral1 && !isEphemeral2) {
    return getMessageId(message1) - getMessageId(message2);
  }

  const timestampDiff = message1.date - message2.date;
  if(timestampDiff) {
    return timestampDiff;
  }

  if(isEphemeral1 && isEphemeral2) {
    return (message1.ephemeral_order || message1.mid) -
      (message2.ephemeral_order || message2.mid);
  }

  return isEphemeral1 ? 1 : -1;
}
