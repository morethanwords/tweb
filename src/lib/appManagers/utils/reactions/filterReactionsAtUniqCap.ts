import {Reaction, ReactionCount} from '@layer';
import reactionsEqual from '@appManagers/utils/reactions/reactionsEqual';

// Default mirrors tdesktop's UniqueReactionsLimit fallback (data/data_peer_values.cpp).
export const DEFAULT_REACTIONS_UNIQ_MAX = 11;

/**
 * Number of DISTINCT reactions that count toward reactions_uniq_max. `reactionPaid`
 * is the star ⭐ counter, not a normal distinct reaction, so it is excluded — this
 * matches Android's `chosenCount` (it skips TL_reactionPaid), MessageObject.selectReaction.
 */
export function countDistinctReactions(messageResults: ReactionCount[] | undefined): number {
  if(!messageResults) {
    return 0;
  }

  let count = 0;
  for(const reactionCount of messageResults) {
    if(reactionCount.reaction._ !== 'reactionPaid') {
      ++count;
    }
  }

  return count;
}

/**
 * reactions_uniq_max — whether a message already carries the max number of DISTINCT
 * reactions, so no new distinct kind may be introduced (the picker must be narrowed to
 * the reactions already present, and the custom-emoji search/packs must be hidden).
 * All three official clients gate this silently (tdesktop customAllowed=false →
 * RecentReactions mode with no footer; iOS areCustomEmojiEnabled=false; Android
 * showCustomEmojiReaction()=false), with no toast/error.
 */
export function isMessageAtUniqReactionCap(
  messageResults: ReactionCount[] | undefined,
  uniqMax = DEFAULT_REACTIONS_UNIQ_MAX
): boolean {
  return countDistinctReactions(messageResults) >= uniqMax;
}

/**
 * Once a message already carries `uniqMax` distinct reactions, no new distinct kind may
 * be introduced: the offered list is narrowed to the reactions already present on the
 * message (you can only pile onto existing kinds).
 *
 * `reactionPaid` is never a normal distinct reaction (it's the star ⭐ counter), so it
 * is always kept. Any offered reaction that already exists on the message is kept too.
 *
 * Below the cap the offered list is returned unchanged (same reference).
 */
export default function filterReactionsAtUniqCap(
  offered: Reaction[],
  messageResults: ReactionCount[] | undefined,
  uniqMax = DEFAULT_REACTIONS_UNIQ_MAX
): Reaction[] {
  if(!offered?.length || !isMessageAtUniqReactionCap(messageResults, uniqMax)) {
    return offered;
  }

  return offered.filter((reaction) => {
    if(reaction._ === 'reactionPaid') {
      return true;
    }

    return messageResults.some((reactionCount) => reactionsEqual(reactionCount.reaction, reaction));
  });
}
