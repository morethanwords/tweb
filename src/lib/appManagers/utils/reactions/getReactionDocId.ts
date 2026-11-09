import type {Reaction} from '@layer';
import {PAID_REACTION_EMOJI_DOCID} from '@lib/customEmoji/constants';

/**
 * The custom emoji a reaction is drawn as: Stars' own, a custom one's document, a standard one's select
 * animation — which `getStandardDocId` finds in the caller's catalog (a miss is the caller's to handle)
 */
export default function getReactionDocId(
  reaction: Reaction,
  getStandardDocId: (emoticon: string) => DocId | undefined
): DocId | undefined {
  switch(reaction._) {
    case 'reactionPaid': return PAID_REACTION_EMOJI_DOCID;
    case 'reactionCustomEmoji': return reaction.document_id;
    case 'reactionEmoji': return getStandardDocId(reaction.emoticon);
  }
}
