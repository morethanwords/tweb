import {TextWithEntities} from '../../layer';
import mergeEntities from './mergeEntities';
import wrapMessageEntities from './wrapMessageEntities';

export default function wrapTextWithEntities(textWithEntities: TextWithEntities): TextWithEntities {
  const {message, entities, myEntities} = wrapMessageEntities(textWithEntities.text, textWithEntities.entities);
  const totalEntities = mergeEntities(entities, myEntities.filter((entity) => entity._ === 'messageEntityCustomEmoji' || entity._ === 'messageEntityEmoji'));
  return {_: 'textWithEntities', text: message, entities: totalEntities};
}
