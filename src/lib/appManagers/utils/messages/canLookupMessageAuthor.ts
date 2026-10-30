import type {MyMessage} from '@appManagers/appMessagesManager';
import isEphemeralMessage from '@appManagers/utils/messages/isEphemeralMessage';
import isAnchoredEphemeralMessage from '@appManagers/utils/messages/isAnchoredEphemeralMessage';

/**
 * Whether the admin who wrote a message can be asked for (`channels.getMessageAuthor`): a regular
 * message of a channel's direct messages, posted as the channel, seen by one of its admins (desktop's
 * `HistoryItem::canLookupMessageAuthor`)
 */
export default function canLookupMessageAuthor(message: MyMessage, isMonoforumAdmin: boolean) {
  return !!isMonoforumAdmin &&
    message?._ === 'message' &&
    !message.pFlags.is_outgoing &&
    !message.pFlags.is_scheduled &&
    !message.pFlags.local &&
    !isEphemeralMessage(message) &&
    !isAnchoredEphemeralMessage(message) &&
    !!message.fromId?.isAnyChat();
}
