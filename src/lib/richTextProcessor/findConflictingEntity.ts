/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {PASS_CONFLICTING_ENTITIES, PASS_SINGLE_CONFLICTING_ENTITIES} from '.';
import {MessageEntity} from '../../layer';

const SINGLE_ENTITIES: Set<MessageEntity['_']> = new Set(['messageEntityPre', 'messageEntityCode']);

export default function findConflictingEntity(currentEntities: MessageEntity[], newEntity: MessageEntity) {
  let singleStart = -1, singleEnd = -1;
  return currentEntities.find((currentEntity) => {
    const {offset, length} = currentEntity;
    if(SINGLE_ENTITIES.has(currentEntity._)) {
      singleStart = offset;
      singleEnd = singleStart + length;
    }

    if(singleStart !== -1) {
      if(
        newEntity.offset >= singleStart &&
        newEntity.offset < singleEnd &&
        !PASS_SINGLE_CONFLICTING_ENTITIES.has(newEntity._)
      ) {
        return true;
      }
    }

    const isConflictingTypes = newEntity._ === currentEntity._ ||
      (!PASS_CONFLICTING_ENTITIES.has(newEntity._) && !PASS_CONFLICTING_ENTITIES.has(currentEntity._));

    if(!isConflictingTypes) {
      return false;
    }

    const isConflictingOffset = newEntity.offset >= offset &&
      (newEntity.length + newEntity.offset) <= (length + offset);

    return isConflictingOffset;
  });
}
