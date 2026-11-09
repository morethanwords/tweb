import type {Reaction} from '@layer';

export default function createEmojiReaction(emoticon: string): Reaction.reactionEmoji {
  return {_: 'reactionEmoji', emoticon};
}
