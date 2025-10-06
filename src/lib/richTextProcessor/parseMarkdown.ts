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
import {MOUNT_CLASS_TO} from '../../config/debug';
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
  const pushEntity = (
    entity: MessageEntity,
    adjustOffset = 0,
    adjustLength = 0
  ) => {
    // * we have to push entity even if it has no length
    // * to match the logic of other apps
    // if(!entity.length) {
    //   return pushedEntity = false;
    // }

    const conflictingEntity = findConflictingEntity(
      currentEntities,
      adjustOffset || adjustLength ? {...entity/* , offset: entity.offset + adjustOffset */, length: entity.length + adjustLength + adjustOffset} : entity,
      true
    );

    return !conflictingEntity ?
      (entities.push(entity), pushedEntity = true) :
      pushedEntity = false;
  };

  const newTextParts: string[] = [];
  let rawOffset = 0, match: RegExpMatchArray;
  while(match = raw.match(MARKDOWN_REG_EXP)) {
    const matchWhitespace = match[1] || '';
    const matchIndexAfterWhitespace = match.index + matchWhitespace.length;
    const matchValueAfterWhitespace = match[0].slice(matchWhitespace.length);
    const matchIndex = rawOffset + matchIndexAfterWhitespace;
    const possibleNextRawOffset = matchIndex + matchValueAfterWhitespace.length;
    const beforeMatch = matchIndexAfterWhitespace > 0 && raw.slice(0, matchIndexAfterWhitespace);
    beforeMatch && newTextParts.push(beforeMatch);
    const text = match[3] || match[8] || match[11] || match[13];
    // rawOffset -= text.length;
    // text = text.replace(/^\s+|\s+$/g, '');
    // rawOffset += text.length;

    let entity: MessageEntity;
    pushedEntity = false;
    if(text.match(/^`*$/)) {
      newTextParts.push(matchValueAfterWhitespace);
    } else if(match[3]) { // pre
      const languageMatch = match[3].match(/(.*?)\n/);
      const language = languageMatch?.[1] || '';

      let code = language ? match[3].slice(language.length) : match[3];
      const startIndex = code[0] === '\n' ? 1 : 0;
      const endIndex = code[code.length - 1] === '\n' ? -1 : undefined;
      code = code.slice(startIndex, endIndex);
      entity = {
        _: 'messageEntityPre',
        language: language,
        offset: matchIndex,
        length: code.length
      };

      const adjustOffset = match[2].length + (language ? language.length : 0) + (startIndex ? 1 : 0);
      const adjustLength = match[4].length + (endIndex ? 1 : 0);
      if(pushEntity(entity, adjustOffset, adjustLength)) {
        if(startIndex) {
          rawOffset -= 1;
        }

        if(endIndex) {
          rawOffset -= 1;
        }

        if(language) {
          rawOffset -= language.length;
        }

        let whitespace = '';
        if(matchWhitespace && false) {
          whitespace = matchWhitespace;
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
      const symbol = match[7];

      entity = {
        _: MARKDOWN_ENTITIES[symbol] as (MessageEntity.messageEntityBold | MessageEntity.messageEntityCode | MessageEntity.messageEntityItalic | MessageEntity.messageEntitySpoiler)['_'],
        // offset: matchIndex + match[6].length,
        offset: matchIndex + (isSOH ? 0 : match[6].length),
        length: text.length
      };

      if(pushEntity(entity, symbol.length, symbol.length)) {
        if(!isSOH) {
          newTextParts.push(match[6] + text + match[9]);
        } else {
          newTextParts.push(text);
        }

        rawOffset -= symbol.length * 2 + (isSOH ? 2 : 0);
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

        rawOffset -= matchValueAfterWhitespace.length - text.length;
      }
    } else if(match[12]) { // text url
      const url = match[14];
      entity = {
        _: 'messageEntityTextUrl',
        url: url,
        offset: matchIndex,
        length: text.length
      };

      const adjustOffset = 1;
      const adjustLength = 4 + url.length;
      if(pushEntity(entity, adjustOffset, adjustLength)) {
        newTextParts.push(text);

        rawOffset -= match[12].length - text.length;
      }
    }

    if(!pushedEntity) {
      newTextParts.push(matchValueAfterWhitespace);
    }

    raw = raw.substr(matchIndexAfterWhitespace + matchValueAfterWhitespace.length);
    rawOffset += matchIndexAfterWhitespace + matchValueAfterWhitespace.length;

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

MOUNT_CLASS_TO && (MOUNT_CLASS_TO.parseMarkdown = parseMarkdown);
