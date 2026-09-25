import {DraftMessage} from '@layer';
import type {LocalTextWithEntities} from '@types';
import mergeEntities from '@lib/richTextProcessor/mergeEntities';
import parseEntities from '@lib/richTextProcessor/parseEntities';

/**
 * A draft as text plus entities — what a field is filled with. The server sends
 * only the entities it knows about, so the ones found in the text itself
 * (emoji, linebreaks) are merged in here, in this order: the other way around
 * breaks bold and emoji formatting.
 */
export default function draftTextWithEntities(draft: DraftMessage.draftMessage): LocalTextWithEntities {
  const myEntities = parseEntities(draft.message);
  const apiEntities = draft.entities || [];
  return {
    text: draft.message,
    entities: mergeEntities(apiEntities, myEntities)
  };
}
