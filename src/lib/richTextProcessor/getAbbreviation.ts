/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import wrapEmojiText from './wrapEmojiText';
import emojiRegExp from '../../vendor/emoji/regex';
import {MessageEntity} from '../../layer';
import getEmojiEntityFromEmoji from './getEmojiEntityFromEmoji';

const EMOJI_REG_EXP = new RegExp(`(^${emojiRegExp})`);
export default function getAbbreviation(str: string, onlyFirst = false) {
  if(!str) return '';
  const splitted = str.trim().split(' ');
  if(!splitted[0]) return '';

  const entities: MessageEntity.messageEntityEmoji[] = [];

  const firstEmojiMatch = splitted[0].match(EMOJI_REG_EXP);
  const first = firstEmojiMatch?.[0] || splitted[0][0];
  if(firstEmojiMatch) {
    entities.push(getEmojiEntityFromEmoji(first));
  }

  if(onlyFirst || splitted.length === 1) return wrapEmojiText(first, undefined, entities);

  const lastEmojiMatch = splitted[1].match(EMOJI_REG_EXP);
  const last = lastEmojiMatch?.[0] || splitted[1][0];
  if(lastEmojiMatch) {
    entities.push({
      ...getEmojiEntityFromEmoji(last),
      offset: last.length
    });
  }

  return wrapEmojiText(first + last, undefined, entities);
}
