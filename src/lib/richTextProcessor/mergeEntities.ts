/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MessageEntity} from '../../layer';
import findConflictingEntity from './findConflictingEntity';
import sortEntities from './sortEntities';

export default function mergeEntities(currentEntities: MessageEntity[], newEntities: MessageEntity[]) {
  currentEntities = currentEntities.slice();
  const filtered = newEntities.filter((e) => {
    return !findConflictingEntity(currentEntities, e);
  });

  currentEntities.push(...filtered);
  sortEntities(currentEntities);
  // currentEntities.sort((a, b) => a.offset - b.offset);
  // currentEntities.sort((a, b) => (a.offset - b.offset) || (a._ === 'messageEntityCaret' && -1));

  // * fix splitted emoji. messageEntityTextUrl can split the emoji if starts before its end (e.g. on fe0f)
  // * have to fix even if emoji supported since it's being wrapped in span
  // if(!IS_EMOJI_SUPPORTED) {
  for(let i = 0; i < currentEntities.length; ++i) {
    let entity = currentEntities[i];
    if(entity._ === 'messageEntityEmoji') {
      const nextEntity = currentEntities[i + 1];
      if(nextEntity /* && nextEntity._ !== 'messageEntityCaret' */ && nextEntity.offset < (entity.offset + entity.length)) {
        entity = currentEntities[i] = {...entity};
        entity.length = nextEntity.offset - entity.offset;
      }
    }
  }
  // }

  return currentEntities;
}
