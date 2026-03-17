/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {PASS_CONFLICTING_ENTITIES, PASS_SINGLE_CONFLICTING_ENTITIES, PASS_SINGLE_CONFLICTING_ENTITIES_WITH_QUOTE, SINGLE_ENTITIES} from '.';
import {MessageEntity} from '@layer';
import isEntityIntersecting from '@lib/richTextProcessor/isEntityIntersecting';

export default function findConflictingEntity(
  currentEntities: MessageEntity[],
  newEntity: MessageEntity,
  isInsertingSingleEntity = SINGLE_ENTITIES.has(newEntity._)
) {
  if(isInsertingSingleEntity) {
    return currentEntities.find((currentEntity) => {
      return isEntityIntersecting(currentEntity, newEntity);
    });
  }

  let singleStart = -1, singleEnd = -1, singleType: MessageEntity['_'];
  return currentEntities.find((currentEntity) => {
    const {offset, length} = currentEntity;
    if(SINGLE_ENTITIES.has(currentEntity._)) {
      singleStart = offset;
      singleEnd = singleStart + length;
      singleType = currentEntity._;
    }

    const isQuoteException = newEntity._ === 'messageEntityBlockquote' && PASS_SINGLE_CONFLICTING_ENTITIES_WITH_QUOTE.has(singleType);

    if(singleStart !== -1) {
      if(
        newEntity.offset >= singleStart &&
        newEntity.offset < singleEnd &&
        !PASS_SINGLE_CONFLICTING_ENTITIES.has(newEntity._) &&
        !isQuoteException
      ) {
        return true;
      }
    }

    const isConflictingTypes = newEntity._ === currentEntity._ ||
      (
        !PASS_CONFLICTING_ENTITIES.has(newEntity._) &&
        !PASS_CONFLICTING_ENTITIES.has(currentEntity._) &&
        !isQuoteException
      );

    if(!isConflictingTypes) {
      return false;
    }

    const isConflictingOffset = newEntity.offset >= offset &&
      (newEntity.length + newEntity.offset) <= (length + offset);

    return isConflictingOffset;
  });
}
