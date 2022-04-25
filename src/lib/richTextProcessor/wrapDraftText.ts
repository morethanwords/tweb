/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MessageEntity } from "../../layer";
import wrapRichText from "./wrapRichText";

export default function wrapDraftText(text: string, options: Partial<{
  entities: MessageEntity[]
}> = {}) {
  if(!text) {
    return wrapRichText('');
  }

  return wrapRichText(text, {
    entities: options.entities, 
    noLinks: true,
    wrappingDraft: true,
    passEntities: {
      messageEntityTextUrl: true,
      messageEntityMentionName: true
    }
  });
}
