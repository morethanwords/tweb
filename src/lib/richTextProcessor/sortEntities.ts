import {MessageEntity} from '../../layer';

export default function sortEntities(entities: MessageEntity[]) {
  entities.sort((a, b) => {
    return (a.offset - b.offset) || (b.length - a.length);
  });
}
