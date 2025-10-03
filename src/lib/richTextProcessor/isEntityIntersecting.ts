import {MessageEntity} from '../../layer';

export default function isEntityIntersecting(entity1: MessageEntity, entity2: MessageEntity) {
  return entity1.offset < entity2.offset + entity2.length && entity1.offset + entity1.length > entity2.offset;
}
