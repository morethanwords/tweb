/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MessageEntity} from '../../layer';

export default function fixEmoji(text: string, entities?: MessageEntity[]) {
  /* if(!IS_EMOJI_SUPPORTED) {
    return text;
  } */
  // '$`\ufe0f'

  text = text.replace(/[\u2640\u2642\u2764](?!\ufe0f)/g, (match, offset, string) => {
    if(entities) {
      const length = match.length;

      offset += length;
      entities.forEach((entity) => {
        const end = entity.offset + entity.length;
        if(end === offset) { // current entity
          entity.length += length;
        } else if(end > offset) {
          entity.offset += length;
        }
      });
    }

    // console.log([match, offset, string]);
    return match + '\ufe0f';
  });

  return text;
}
