import type {ChatReactions} from '@layer';

export type ChatReactionsSummary =
  | {type: 'all'}
  | {type: 'off'}
  | {type: 'count', count: number}
  | {type: 'fraction', selected: number, total: number};

/**
 * What the chat's edit screen shows next to "Reactions" (Android / Desktop rules):
 * All; Off; a bare count for a channel (with Stars counted); selected / available for a group.
 * `activeEmoticons` are the standard reactions that are active in the catalog right now.
 */
export default function getChatReactionsSummary({reactions, isBroadcast, paidEnabled, activeEmoticons}: {
  reactions?: ChatReactions,
  isBroadcast: boolean,
  paidEnabled?: boolean,
  activeEmoticons: Iterable<string>
}): ChatReactionsSummary {
  const paid = isBroadcast && paidEnabled ? 1 : 0;
  if(reactions?._ === 'chatReactionsAll') {
    return {type: 'all'};
  }

  if(reactions?._ !== 'chatReactionsSome') {
    return paid ? {type: 'count', count: paid} : {type: 'off'};
  }

  const active = new Set(activeEmoticons);
  let selected = 0;
  let custom = 0;
  for(const reaction of reactions.reactions) {
    if(reaction._ === 'reactionEmoji') {
      if(active.has(reaction.emoticon)) {
        ++selected;
      }
    } else if(reaction._ === 'reactionCustomEmoji') {
      ++custom;
    }
  }

  if(isBroadcast) {
    return {type: 'count', count: selected + custom + paid};
  }

  return {type: 'fraction', selected, total: active.size};
}
