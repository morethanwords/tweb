import {MessageEntity} from '../../layer';
import {toCodePoints} from '../../vendor/emoji';

export default function getEmojiEntityFromEmoji(emoji: string): MessageEntity.messageEntityEmoji {
  return {
    _: 'messageEntityEmoji',
    offset: 0,
    length: emoji.length,
    unicode: toCodePoints(emoji).join('-').replace(/-?fe0f/g, '')
  };
}
