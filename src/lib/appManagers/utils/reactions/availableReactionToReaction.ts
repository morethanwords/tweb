import {AvailableReaction, Reaction} from '@layer';
import createEmojiReaction from '@appManagers/utils/reactions/createEmojiReaction';

export default function availableReactionToReaction(availableReaction: AvailableReaction): Reaction.reactionEmoji {
  return createEmojiReaction(availableReaction.reaction);
}
