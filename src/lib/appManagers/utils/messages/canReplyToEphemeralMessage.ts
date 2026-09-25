import type {Message} from '@layer';

/**
 * A reply to an ephemeral message goes privately to the bot that sent it, so only an incoming one
 * from a user can be answered — not our own, and not one the chat itself sent, as a delivered
 * welcome message is (desktop's `CanReplyToEphemeral` → `botForSending`).
 */
export default function canReplyToEphemeralMessage(message: Message.message) {
  return !message.pFlags.out && !!message.fromId?.isUser();
}
