import {MessageEntity} from '@layer';

// * U+FE0F only asks for the emoji look and shows nothing of its own, so a stray one (`😔` followed by a few) is not text
const NOT_TEXT = /[\s\ufe0f]/g;

/**
 * How many emoji the text is made of, when it is made of emoji only (with whitespace between them), or 0.
 * Entities are the message's total ones: a custom emoji comes there followed by the emoji it covers.
 */
export default function countEmojiOnly(text: string, entities: MessageEntity[]) {
  let count = 0, emojiLength = 0;
  for(let i = 0, length = entities.length; i < length; ++i) {
    const entity = entities[i];
    if(entity._ === 'messageEntityCustomEmoji') {
      ++i;
    } else if(entity._ !== 'messageEntityEmoji') {
      continue;
    }

    ++count;
    emojiLength += text.slice(entity.offset, entity.offset + entity.length).replace(NOT_TEXT, '').length;
  }

  return count && emojiLength === text.replace(NOT_TEXT, '').length ? count : 0;
}
