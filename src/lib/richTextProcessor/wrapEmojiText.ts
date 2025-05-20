/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {createEffect} from 'solid-js';
import {MessageEntity} from '../../layer';
import parseEntities from './parseEntities';
import wrapRichText from './wrapRichText';

export default function wrapEmojiText(text: string, isDraft = false, entities?: MessageEntity[]) {
  if(!text) return wrapRichText('');

  entities ??= parseEntities(text).filter((e) => e._ === 'messageEntityEmoji');
  return wrapRichText(text, {entities, wrappingDraft: isDraft});
}

export function EmojiTextTsx(props: {
  text: string,
  isDraft?: boolean,
  entities?: MessageEntity[]
}) {
  const span = document.createElement('span');
  createEffect(() => {
    span.replaceChildren(wrapEmojiText(props.text, props.isDraft, props.entities));
  });
  return span;
}
