import {MessageEntity} from '@layer';


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
      // pull an entity whose offset fell into the trimmed trailing whitespace
      // back inside the text, then clamp its length so it never overflows or
      // goes negative
      if(entity.offset > text.length) {
        entity.offset = text.length;
      }

      if((entity.offset + entity.length) > text.length) {
        entity.length = text.length - entity.offset;
      }
    });
  }

  // drop entities that ended up empty after trimming (they no longer reference
  // any real text)
  entities = entities.filter((entity) => entity.length > 0);

  return {text, entities};
}
