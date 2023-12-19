/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import type {AnimationItemGroup} from '../../components/animationIntersector';
import rootScope from '../rootScope';
import wrapRichText from './wrapRichText';

export default function wrapDraftText(text: string, options: Partial<{
  wrappingForPeerId: PeerId,
  animationGroup?: AnimationItemGroup
}> & Parameters<typeof wrapRichText>[1] = {}) {
  if(!text) {
    return wrapRichText('');
  }

  let entities = options.entities;
  if(entities && !rootScope.premium && options.wrappingForPeerId !== rootScope.myId) {
    entities = entities.filter((entity) => entity._ !== 'messageEntityCustomEmoji');
  }

  const fragment = wrapRichText(text, {
    ...options,
    entities,
    noLinks: true,
    wrappingDraft: true,
    passEntities: {
      messageEntityTextUrl: true,
      messageEntityMentionName: true
    }
  });

  return fragment;
}
