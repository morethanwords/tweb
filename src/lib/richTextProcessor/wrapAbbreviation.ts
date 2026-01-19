/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import wrapEmojiText from '@lib/richTextProcessor/wrapEmojiText';
import getAbbreviation from '@lib/richTextProcessor/getAbbreviation';

export default function wrapAbbreviation(str: string, onlyFirst?: boolean) {
  const {text, entities} = getAbbreviation(str, onlyFirst);
  return wrapEmojiText(text, undefined, entities);
}
