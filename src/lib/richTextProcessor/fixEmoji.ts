import {MessageEntity} from '@layer';
import {lowerBound} from '@helpers/array/lowerBound';
import {removeEmojiTone} from '@vendor/emoji';

/** How many of the positions, ascending whole numbers, are at most `value`. */
function countAtMost(positions: number[], value: number) {
  return lowerBound(0, positions.length - 1, value + 1, (index) => positions[index]);
}

export default function fixEmoji(text: string, entities?: MessageEntity[]) {
  /* if(!IS_EMOJI_SUPPORTED) {
    return text;
  } */
  // '$`️'

  // where each U+FE0F goes in the text as it was: right after its emoji, so it belongs to whatever the emoji does
  const insertions: number[] = [];
  text = text.replace(/[♀♂❤](?!️)/g, (match, offset) => {
    insertions.push(offset + match.length);
    return match + '️';
  });

  // * an entity moves by the ones before its start and grows by the ones inside it, at its end included —
  // * counted, not applied one by one: a message can have thousands of both
  if(entities && insertions.length) {
    entities.forEach((entity) => {
      const end = entity.offset + entity.length;
      const before = countAtMost(insertions, entity.offset);
      entity.offset += before;
      entity.length += countAtMost(insertions, end) - before;
    });
  }

  return text;
}

// * convert '❤️' to '❤' for server compatibility
export function cleanEmoji(emoji: string) {
  return removeEmojiTone(emoji.replace(/️/g, ''));
}
