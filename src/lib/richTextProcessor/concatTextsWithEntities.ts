import {TextWithEntities} from '@layer';

export function concatTextsWithEntities(items: TextWithEntities.textWithEntities[]) {
  const result: TextWithEntities.textWithEntities = {
    _: 'textWithEntities',
    text: '',
    entities: []
  };

  for(const item of items) {
    const entities = item.entities?.map(entity => ({
      ...entity, offset: entity.offset + result.text.length
    })) ?? [];

    result.entities.push(...entities);

    result.text += item.text;
  }

  return result;
}
