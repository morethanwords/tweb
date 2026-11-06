import {MessageEntity} from '@layer';
import {createEntityConflictCheck} from '@lib/richTextProcessor/findConflictingEntity';
import sortEntities from '@lib/richTextProcessor/sortEntities';

export default function mergeEntities(currentEntities: MessageEntity[], newEntities: MessageEntity[]) {
  const isConflicting = createEntityConflictCheck(currentEntities);
  currentEntities = currentEntities.concat(newEntities.filter((entity) => !isConflicting(entity)));
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
