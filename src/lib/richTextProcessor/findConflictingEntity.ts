/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { PASS_CONFLICTING_ENTITIES } from ".";
import { MessageEntity } from "../../layer";

export default function findConflictingEntity(currentEntities: MessageEntity[], newEntity: MessageEntity) {
  return currentEntities.find((currentEntity) => {
    const isConflictingTypes = newEntity._ === currentEntity._ || 
      (!PASS_CONFLICTING_ENTITIES.has(newEntity._) && !PASS_CONFLICTING_ENTITIES.has(currentEntity._));

    if(!isConflictingTypes) {
      return false;
    }

    const isConflictingOffset = newEntity.offset >= currentEntity.offset && 
      (newEntity.length + newEntity.offset) <= (currentEntity.length + currentEntity.offset);

    return isConflictingOffset;
  });
}
