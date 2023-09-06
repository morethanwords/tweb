import {AvailableReaction, Reaction} from '../../../../layer';

export default function availableReactionToReaction(availableReaction: AvailableReaction): Reaction.reactionEmoji {
  return {
    _: 'reactionEmoji',
    emoticon: availableReaction.reaction
  };
}
