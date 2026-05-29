import {MessageEntity} from '@layer';
import {sliceTextWithEntities} from '@lib/richTextProcessor/sliceTextWithEntities';

/**
 * Uses Unicode horizontal ellipsis (U+2026) instead of "..."
 * for better typography, line breaking, and internationalization.
 */
const ELLIPSIS = '…';

export function truncateTextWithEntities(
  text: string,
  entities: MessageEntity[],
  n: number
): {text: string, entities: MessageEntity[]} {
  if(text.length <= n) {
    return {text, entities};
  }

  if(n <= ELLIPSIS.length) {
    // Not enough room for content + ellipsis; just return as much ellipsis as fits.
    return {text: ELLIPSIS.slice(0, Math.max(0, n)), entities: []};
  }

  const budget = n - ELLIPSIS.length;
  const sliced = sliceTextWithEntities(text, entities, 0, budget);

  return {
    text: sliced.text + ELLIPSIS,
    entities: sliced.entities
  };
}
