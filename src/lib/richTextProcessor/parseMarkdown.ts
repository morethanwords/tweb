/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 *
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import {MARKDOWN_ENTITIES, MARKDOWN_REG_EXP} from '.';
import {MessageEntity} from '../../layer';
import combineSameEntities from './combineSameEntities';
import findConflictingEntity from './findConflictingEntity';
import mergeEntities from './mergeEntities';

export default function parseMarkdown(raw: string, currentEntities: MessageEntity[] = [], noTrim?: boolean) {
  /* if(!markdownTestRegExp.test(text)) {
    return noTrim ? text : text.trim();
  } */

  const entities: MessageEntity[] = [];
  let pushedEntity = false;
  const pushEntity = (entity: MessageEntity) => !findConflictingEntity(currentEntities, entity) ? (entities.push(entity), pushedEntity = true) : pushedEntity = false;

  const newTextParts: string[] = [];
  let rawOffset = 0, match;
  while(match = raw.match(MARKDOWN_REG_EXP)) {
    const matchIndex = rawOffset + match.index;
    const possibleNextRawOffset = match.index + match[0].length;
    const beforeMatch = match.index > 0 && raw.slice(0, match.index);
    beforeMatch && newTextParts.push(beforeMatch);
    const text = match[3] || match[8] || match[11] || match[13];
    // rawOffset -= text.length;
    // text = text.replace(/^\s+|\s+$/g, '');
    // rawOffset += text.length;

    let entity: MessageEntity;
    pushedEntity = false;
    if(text.match(/^`*$/)) {
      newTextParts.push(match[0]);
    } else if(match[3]) { // pre
      let languageMatch = match[3].match(/(.*?)\n/);
      if(!languageMatch?.[1]) {
        languageMatch = undefined;
      }

      let code = languageMatch ? match[3].slice(languageMatch[1].length) : match[3];
      const startIndex = code[0] === '\n' ? 1 : 0;
      const endIndex = code[code.length - 1] === '\n' ? -1 : undefined;
      code = code.slice(startIndex, endIndex);
      entity = {
        _: 'messageEntityPre',
        language: languageMatch?.[1] || '',
        offset: matchIndex + match[1].length,
        length: code.length
      };

      if(pushEntity(entity)) {
        if(endIndex) {
          rawOffset -= 1;
        }

        if(languageMatch) {
          rawOffset -= languageMatch[0].length;
        }

        let whitespace = '';
        if(match[1]) {
          whitespace = match[1];
        } else {
          const previousPart = newTextParts[newTextParts.length - 1];
          if(previousPart && !/\s/.test(previousPart[previousPart.length - 1])) {
            whitespace = '\n';
          }
        }

        newTextParts.push(whitespace, code, match[5]);

        rawOffset -= match[2].length + match[4].length;
      }
    } else if(match[7]) { // code|italic|bold
      const isSOH = match[6] === '\x01';

      entity = {
        _: MARKDOWN_ENTITIES[match[7]] as (MessageEntity.messageEntityBold | MessageEntity.messageEntityCode | MessageEntity.messageEntityItalic | MessageEntity.messageEntitySpoiler)['_'],
        // offset: matchIndex + match[6].length,
        offset: matchIndex + (isSOH ? 0 : match[6].length),
        length: text.length
      };

      if(pushEntity(entity)) {
        if(!isSOH) {
          newTextParts.push(match[6] + text + match[9]);
        } else {
          newTextParts.push(text);
        }

        rawOffset -= match[7].length * 2 + (isSOH ? 2 : 0);
      }
    } else if(match[11]) { // custom mention
      entity = {
        _: 'messageEntityMentionName',
        user_id: match[10].toUserId(),
        offset: matchIndex,
        length: text.length
      };

      if(pushEntity(entity)) {
        newTextParts.push(text);

        rawOffset -= match[0].length - text.length;
      }
    } else if(match[12]) { // text url
      entity = {
        _: 'messageEntityTextUrl',
        url: match[14],
        offset: matchIndex,
        length: text.length
      };

      if(pushEntity(entity)) {
        newTextParts.push(text);

        rawOffset -= match[12].length - text.length;
      }
    }

    if(!pushedEntity) {
      newTextParts.push(match[0]);
    }

    raw = raw.substr(match.index + match[0].length);
    rawOffset += match.index + match[0].length;

    const rawOffsetDiff = rawOffset - possibleNextRawOffset;
    if(rawOffsetDiff) {
      currentEntities.forEach((entity) => {
        if(entity.offset >= matchIndex) {
          entity.offset += rawOffsetDiff;
        }
      });
    }
  }

  raw && newTextParts.push(raw);
  let newText = newTextParts.join('');
  if(!newText.replace(/\s+/g, '').length) {
    newText = raw;
    entities.splice(0, entities.length);
  }

  // ! idk what it was here for
  // if(!entities.length && !noTrim) {
  //   newText = newText.trim();
  // }

  currentEntities = mergeEntities(currentEntities, entities);
  combineSameEntities(currentEntities);

  let length = newText.length;
  if(!noTrim) {
    // trim left
    newText = newText.replace(/^\s*/, '');

    let diff = length - newText.length;
    if(diff) {
      currentEntities.forEach((entity) => {
        entity.offset = Math.max(0, entity.offset - diff);
      });
    }

    // trim right
    newText = newText.replace(/\s*$/, '');
    diff = length - newText.length;
    length = newText.length;
    if(diff) {
      currentEntities.forEach((entity) => {
        if((entity.offset + entity.length) > length) {
          entity.length = length - entity.offset;
        }
      });
    }
  }

  return [newText, currentEntities] as const;
}
