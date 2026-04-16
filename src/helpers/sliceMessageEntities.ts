import {MessageEntity} from '@layer';

export default function sliceMessageEntities(entities: MessageEntity[], offset: number, length: number): MessageEntity[] {
  if(!entities?.length) return [];
  const result: MessageEntity[] = [];
  const end = offset + length;
  for(const entity of entities) {
    const entityEnd = entity.offset + entity.length;
    if(entityEnd <= offset || entity.offset >= end) continue;
    const newOffset = Math.max(entity.offset, offset) - offset;
    const newLength = Math.min(entityEnd, end) - Math.max(entity.offset, offset);
    if(newLength > 0) {
      result.push({...entity, offset: newOffset, length: newLength});
    }
  }
  return result;
}
