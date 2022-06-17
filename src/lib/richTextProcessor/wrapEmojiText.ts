/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import parseEntities from "./parseEntities";
import wrapRichText from "./wrapRichText";

export default function wrapEmojiText(text: string, isDraft = false) {
  if(!text) return wrapRichText('');

  let entities = parseEntities(text).filter((e) => e._ === 'messageEntityEmoji');
  return wrapRichText(text, {entities, wrappingDraft: isDraft});
}
