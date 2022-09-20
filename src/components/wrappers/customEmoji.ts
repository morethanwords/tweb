/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {MediaSize} from '../../helpers/mediaSize';
import {Middleware} from '../../helpers/middleware';
import {MessageEntity} from '../../layer';
import wrapRichText from '../../lib/richTextProcessor/wrapRichText';
import {AnimationItemGroup} from '../animationIntersector';
import LazyLoadQueue from '../lazyLoadQueue';

export default function wrapCustomEmoji({
  docIds,
  loadPromises,
  middleware,
  lazyLoadQueue,
  size,
  animationGroup
}: {
  docIds: DocId[],
  loadPromises?: Promise<any>[],
  middleware?: Middleware,
  lazyLoadQueue?: LazyLoadQueue,
  size?: MediaSize,
  animationGroup?: AnimationItemGroup
}) {
  let text = '';
  const entities: MessageEntity[] = [];
  docIds.forEach((docId) => {
    entities.push({
      _: 'messageEntityCustomEmoji',
      offset: text.length,
      length: 1,
      document_id: docId
    });

    text += ' ';
  });

  const wrapped = wrapRichText(text, {
    entities,
    loadPromises,
    animationGroup,
    customEmojiSize: size,
    middleware,
    lazyLoadQueue
  });

  return wrapped;
}

