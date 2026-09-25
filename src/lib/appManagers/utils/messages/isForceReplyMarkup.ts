import type {ReplyMarkup} from '@layer';

/**
 * Whether a markup asks for a reply. Layer 229 moved the force-reply bit onto the keyboard markups
 * themselves, so a `replyKeyboardMarkup` / `replyInlineMarkup` carrying `force_reply` asks for one
 * exactly like the standalone `replyKeyboardForceReply` does.
 */
export default function isForceReplyMarkup(replyMarkup: ReplyMarkup): replyMarkup is
  ReplyMarkup.replyKeyboardForceReply | ReplyMarkup.replyKeyboardMarkup | ReplyMarkup.replyInlineMarkup {
  return replyMarkup?._ === 'replyKeyboardForceReply' ||
    ((replyMarkup?._ === 'replyKeyboardMarkup' || replyMarkup?._ === 'replyInlineMarkup') &&
      !!replyMarkup.pFlags.force_reply);
}
