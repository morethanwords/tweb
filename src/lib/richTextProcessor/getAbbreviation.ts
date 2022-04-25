/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import wrapEmojiText from "./wrapEmojiText";

export default function getAbbreviation(str: string, onlyFirst = false) {
  if(!str) return '';
  const splitted = str.trim().split(' ');
  if(!splitted[0]) return '';

  const first = [...splitted[0]][0];

  if(onlyFirst || splitted.length === 1) return wrapEmojiText(first);

  const last = [...splitted[splitted.length - 1]][0];

  return wrapEmojiText(first + last);
}
