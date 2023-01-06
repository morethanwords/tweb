/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MessageEntity} from '../../layer';
import getEmojiEntityFromEmoji from './getEmojiEntityFromEmoji';
import emojiRegExp from '../../vendor/emoji/regex';

const EMOJI_REG_EXP = new RegExp(`(^${emojiRegExp})`);

export default function getAbbreviation(str: string, onlyFirst = false): {
  text: string,
  entities: MessageEntity[]
} {
  const splitted = (str || '').trim().split(' ');
  if(!splitted[0]) return {text: '', entities: []};

  const entities: MessageEntity.messageEntityEmoji[] = [];

  const firstEmojiMatch = splitted[0].match(EMOJI_REG_EXP);
  const first = firstEmojiMatch?.[0] || splitted[0][0];
  if(firstEmojiMatch) {
    entities.push(getEmojiEntityFromEmoji(first));
  }

  const length = splitted.length;
  if(onlyFirst || length === 1) return {text: first, entities};

  const lastEmojiMatch = splitted[length - 1].match(EMOJI_REG_EXP);
  const last = lastEmojiMatch?.[0] || splitted[length - 1][0];
  if(lastEmojiMatch) {
    entities.push({
      ...getEmojiEntityFromEmoji(last),
      offset: first.length
    });
  }

  return {text: first + last, entities};
}
