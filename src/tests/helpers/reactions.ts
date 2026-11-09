import {ChatReactions, Reaction, ReactionCount} from '@layer';

export {default as emoji} from '@appManagers/utils/reactions/createEmojiReaction';

export function custom(document_id: string): Reaction.reactionCustomEmoji {
  return {_: 'reactionCustomEmoji', document_id};
}

export const paid: Reaction.reactionPaid = {_: 'reactionPaid'};

export function count(reaction: Reaction, n = 1): ReactionCount {
  return {_: 'reactionCount', count: n, reaction};
}

export function some(...reactions: Reaction[]): ChatReactions.chatReactionsSome {
  return {_: 'chatReactionsSome', reactions};
}
