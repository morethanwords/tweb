import type {Reaction} from '@layer';
import {PAID_REACTION_EMOJI_DOCID} from '@lib/customEmoji/constants';
import createEmojiReaction from '@appManagers/utils/reactions/createEmojiReaction';

/**
 * The reaction a custom emoji document stands for (the inverse of `getReactionDocId`): Stars' own is
 * Stars, a standard reaction's select animation — which `getStandardEmoticon` finds in the caller's
 * catalog — is that emoji, any other is a custom emoji
 */
export default function docIdToReaction(
  docId: DocId,
  getStandardEmoticon?: (docId: DocId) => string | undefined
): Reaction {
  if(docId === PAID_REACTION_EMOJI_DOCID) {
    return {_: 'reactionPaid'};
  }

  const emoticon = getStandardEmoticon?.(docId);
  return emoticon ? createEmojiReaction(emoticon) : {_: 'reactionCustomEmoji', document_id: docId};
}
