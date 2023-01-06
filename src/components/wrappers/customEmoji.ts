/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MessageEntity} from '../../layer';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';

export default function wrapCustomEmoji({
  docIds,
  loadPromises,
  middleware,
  lazyLoadQueue,
  customEmojiSize,
  animationGroup
}: {
  docIds: DocId[],
  loadPromises?: Promise<any>[]
} & WrapSomethingOptions) {
  const text = ' '.repeat(docIds.length);
  const entities: MessageEntity[] = [];
  docIds.forEach((docId, idx) => {
    entities.push({
      _: 'messageEntityCustomEmoji',
      offset: idx,
      length: 1,
      document_id: docId
    });
  });

  const wrapped = wrapRichText(text, {
    entities,
    loadPromises,
    animationGroup,
    customEmojiSize,
    middleware,
    lazyLoadQueue
  });

  return wrapped;
}

export function wrapCustomEmojiAwaited(options: Parameters<typeof wrapCustomEmoji>[0]) {
  const loadPromises: Promise<any>[] = options.loadPromises ??= [];
  const wrapped = wrapCustomEmoji(options);
  return Promise.all(loadPromises).then(() => wrapped);
}
