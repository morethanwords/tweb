import {MessageEntity} from '../../layer';
import fixEmoji from './fixEmoji';
import mergeEntities from './mergeEntities';
import parseEntities from './parseEntities';

export default function wrapMessageEntities(message: string, entities: MessageEntity[] = []) {
  message = fixEmoji(message, entities);

  const myEntities = parseEntities(message);
  const totalEntities = mergeEntities(entities, myEntities); // ! only in this order, otherwise bold and emoji formatting won't work
  return {
    message,
    entities,
    myEntities,
    totalEntities
  };
}
