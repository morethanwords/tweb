import {PASS_CONFLICTING_ENTITIES, PASS_SINGLE_CONFLICTING_ENTITIES, PASS_SINGLE_CONFLICTING_ENTITIES_WITH_QUOTE, SINGLE_ENTITIES} from '.';
import {MessageEntity} from '@layer';
import {lowerBound} from '@helpers/array/lowerBound';
import isEntityIntersecting from '@lib/richTextProcessor/isEntityIntersecting';

function isQuoteException(newEntity: MessageEntity, singleType: MessageEntity['_']) {
  return newEntity._ === 'messageEntityBlockquote' && PASS_SINGLE_CONFLICTING_ENTITIES_WITH_QUOTE.has(singleType);
}

/** Whether an entity of `currentType` holding the whole of `newEntity` keeps it out. */
function isConflictingType(currentType: MessageEntity['_'], newEntity: MessageEntity, quoteException: boolean) {
  return newEntity._ === currentType ||
    (
      !PASS_CONFLICTING_ENTITIES.has(newEntity._) &&
      !PASS_CONFLICTING_ENTITIES.has(currentType) &&
      !quoteException
    );
}

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

    const quoteException = isQuoteException(newEntity, singleType);

    if(singleStart !== -1) {
      if(
        newEntity.offset >= singleStart &&
        newEntity.offset < singleEnd &&
        !PASS_SINGLE_CONFLICTING_ENTITIES.has(newEntity._) &&
        !quoteException
      ) {
        return true;
      }
    }

    if(!isConflictingType(currentEntity._, newEntity, quoteException)) {
      return false;
    }

    const isConflictingOffset = newEntity.offset >= offset &&
      (newEntity.length + newEntity.offset) <= (length + offset);

    return isConflictingOffset;
  });
}

/** Entities in the order of their offsets, with the furthest end reached by each prefix of them. */
type EntityReach = {offsets: number[], furthestEnds: number[]};

function createEntityReach(entities: MessageEntity[]): EntityReach {
  // * one without a length conflicts with nothing in `findConflictingEntity` either
  const sorted = entities.filter((entity) => Number.isFinite(entity.offset + entity.length))
  .sort((a, b) => a.offset - b.offset);
  const offsets: number[] = new Array(sorted.length);
  const furthestEnds: number[] = new Array(sorted.length);
  let furthestEnd = -Infinity;
  sorted.forEach((entity, index) => {
    offsets[index] = entity.offset;
    furthestEnds[index] = furthestEnd = Math.max(furthestEnd, entity.offset + entity.length);
  });
  return {offsets, furthestEnds};
}

/** Whether one of the entities starts before `start` (or at it) and ends after `end` (or at it). */
function hasEntitySpanning(reach: EntityReach, start: number, orAtStart: boolean, end: number, orAtEnd: boolean) {
  const {offsets, furthestEnds} = reach;
  // * offsets are whole numbers: at most `start` is less than the next one
  const count = lowerBound(0, offsets.length - 1, orAtStart ? start + 1 : start, (index) => offsets[index]);
  if(!count) return false;
  const furthestEnd = furthestEnds[count - 1];
  return furthestEnd > end || (orAtEnd && furthestEnd === end);
}

/**
 * `findConflictingEntity` for many new entities against the same current ones, each answered in
 * logarithmic time instead of a pass over all of them: the current entities are a message's, its
 * sender's to make thousands of, and so are the entities found in its text.
 */
export function createEntityConflictCheck(currentEntities: MessageEntity[]) {
  let all: EntityReach, singles: EntityReach;
  const byNewType = new Map<MessageEntity['_'], EntityReach>();

  return (newEntity: MessageEntity) => {
    // * whether a quote conflicts depends on the order of the entities before it: none of them come from the text
    if(newEntity._ === 'messageEntityBlockquote') {
      return !!findConflictingEntity(currentEntities, newEntity);
    }

    const start = newEntity.offset, end = newEntity.offset + newEntity.length;
    if(SINGLE_ENTITIES.has(newEntity._)) {
      all ??= createEntityReach(currentEntities);
      return hasEntitySpanning(all, end, false, start, false);
    }

    if(!PASS_SINGLE_CONFLICTING_ENTITIES.has(newEntity._)) {
      singles ??= createEntityReach(currentEntities.filter((entity) => SINGLE_ENTITIES.has(entity._)));
      if(hasEntitySpanning(singles, start, true, start, false)) return true;
    }

    let conflicting = byNewType.get(newEntity._);
    if(!conflicting) {
      byNewType.set(newEntity._, conflicting = createEntityReach(currentEntities.filter((entity) => {
        return isConflictingType(entity._, newEntity, false);
      })));
    }

    return hasEntitySpanning(conflicting, start, true, end, true);
  };
}
