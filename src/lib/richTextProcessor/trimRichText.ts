import {MessageEntity} from '@layer';


export default function trimRichText(text: string, entities: MessageEntity[]) {
  const originalText = text;
  entities = structuredClone(entities);
  const left = originalText.match(/^\s*/)[0].length;
  text = originalText.slice(left).replace(/\s*$/, '');
  const right = left + text.length;

  entities = entities.filter((entity) => {
    const start = Math.max(left, entity.offset);
    const end = Math.min(right, entity.offset + entity.length);
    entity.offset = start - left;
    entity.length = end - start;
    return entity.length > 0;
  });

  return {text, entities};
}
