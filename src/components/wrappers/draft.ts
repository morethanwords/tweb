/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {DraftMessage} from '../../layer';
import mergeEntities from '../../lib/richTextProcessor/mergeEntities';
import parseEntities from '../../lib/richTextProcessor/parseEntities';
import wrapDraftText from '../../lib/richTextProcessor/wrapDraftText';

export default function wrapDraft(draft: DraftMessage.draftMessage, wrappingForPeerId: PeerId, loadPromises?: Promise<any>[]) {
  const myEntities = parseEntities(draft.message);
  const apiEntities = draft.entities || [];
  const totalEntities = mergeEntities(apiEntities.slice(), myEntities); // ! only in this order, otherwise bold and emoji formatting won't work

  return wrapDraftText(draft.message, {entities: totalEntities, wrappingForPeerId, loadPromises});
}
