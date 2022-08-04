/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MessageEntity} from '../../layer';

const CAN_COMBINE_ENTITIES: Set<MessageEntity['_']> = new Set([
  'messageEntityBold',
  'messageEntityItalic',
  'messageEntityCode',
  'messageEntityPre',
  'messageEntityUnderline',
  'messageEntityStrike',
  'messageEntityBlockquote',
  'messageEntitySpoiler'
]);
export default function combineSameEntities(entities: MessageEntity[]) {
  // entities = entities.slice();
  for(let i = 0; i < entities.length; ++i) {
    const entity = entities[i];

    let nextEntityIdx = -1;
    do {
      nextEntityIdx = entities.findIndex((e, _i) => {
        return CAN_COMBINE_ENTITIES.has(e._) && _i !== i && e._ === entity._ && (e.offset - entity.length) === entity.offset;
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
