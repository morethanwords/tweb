/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import deepEqual from '@helpers/object/deepEqual';
import {MessageEntity} from '@layer';

const CAN_COMBINE_ENTITIES: Set<MessageEntity['_']> = new Set([
  'messageEntityBold',
  'messageEntityItalic',
  'messageEntityCode',
  'messageEntityPre',
  'messageEntityUnderline',
  'messageEntityStrike',
  // 'messageEntityBlockquote',
  'messageEntitySpoiler',
  'messageEntityFormattedDate',
  'messageEntityTextUrl'
]);
const combineMap: {[entityType in MessageEntity['_']]?: (entity1: any, entity2: any) => boolean} = {
  messageEntityFormattedDate: (entity1: MessageEntity.messageEntityFormattedDate, entity2: MessageEntity.messageEntityFormattedDate) => {
    return entity1.date === entity2.date && deepEqual(entity1.pFlags, entity2.pFlags);
  },
  messageEntityPre: (entity1: MessageEntity.messageEntityPre, entity2: MessageEntity.messageEntityPre) => {
    return entity1.language === entity2.language;
  },
  messageEntityTextUrl: (entity1: MessageEntity.messageEntityTextUrl, entity2: MessageEntity.messageEntityTextUrl) => {
    return entity1.url === entity2.url;
  }
};
export default function combineSameEntities(entities: MessageEntity[]) {
  // entities = entities.slice();
  for(let i = 0; i < entities.length; ++i) {
    const entity = entities[i];

    let nextEntityIdx = -1;
    do {
      nextEntityIdx = entities.findIndex((e, _i) => {
        const verifyFunc = combineMap[entity._];
        return CAN_COMBINE_ENTITIES.has(e._) &&
          _i !== i &&
          e._ === entity._ &&
          (e.offset - entity.length) === entity.offset &&
          (verifyFunc?.(entity, e) ?? true);
      });

      if(nextEntityIdx !== -1) {
        const nextEntity = entities[nextEntityIdx];
        entity.length += nextEntity.length;
        entities.splice(nextEntityIdx, 1);
      }
    } while(nextEntityIdx !== -1);
  }
  // return entities;
}
