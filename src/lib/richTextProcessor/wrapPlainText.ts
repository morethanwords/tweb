/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MessageEntity } from "../../layer";
import wrapRichText from "./wrapRichText";

/**
  * ! This function is still unsafe to use with .innerHTML
  */
export default function wrapPlainText(text: string, entities: MessageEntity[] = []) {
  if(entities?.length) {
    entities = entities.filter(entity => entity._ === 'messageEntitySpoiler');
  }

  return wrapRichText(text, {
    entities, 
    noEncoding: true,
    noTextFormat: true,
    noLinebreaks: true,
    noLinks: true
  }).textContent;
}
