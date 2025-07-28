import {MessageEntity} from '../../layer';


export default function trimRichText(text: string, entities: MessageEntity[]) {
  entities = structuredClone(entities);
  let prevLength = text.length;

  // trim left
  text = text.replace(/^\s*/, '');
  let diff = prevLength - text.length;

  if(diff) {
    entities.forEach((entity) => {
      entity.offset = Math.max(0, entity.offset - diff);
    });
  }

  prevLength = text.length;

  // trim right
  text = text.replace(/\s*$/, '');
  diff = prevLength - text.length;

  if(diff) {
    entities.forEach((entity) => {
      if((entity.offset + entity.length) > text.length) {
        entity.length = text.length - entity.offset;
      }
    });
  }

  return {text, entities};
}
