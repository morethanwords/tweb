import getEmojiEntityFromEmoji from '@lib/richTextProcessor/getEmojiEntityFromEmoji';
import wrapRichText from '@lib/richTextProcessor/wrapRichText';

export default function wrapSingleEmoji(emoji: string) {
  return wrapRichText(emoji, {
    entities: [getEmojiEntityFromEmoji(emoji)]
  });
}
