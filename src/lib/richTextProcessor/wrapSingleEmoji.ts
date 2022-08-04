/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import getEmojiEntityFromEmoji from './getEmojiEntityFromEmoji';
import wrapRichText from './wrapRichText';

export default function wrapSingleEmoji(emoji: string) {
  return wrapRichText(emoji, {
    entities: [getEmojiEntityFromEmoji(emoji)]
  });
}
