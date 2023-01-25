/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {AppManagers} from '../../lib/appManagers/managers';
import rootScope from '../../lib/rootScope';
import wrapSticker from './sticker'
import {Modify} from '../../types';

export default async function wrapStickerEmoji(options: Modify<Parameters<typeof wrapSticker>[0], {
  div: HTMLElement,
  doc?: never
}>) {
  const {
    emoji,
    div,
    managers = rootScope.managers
  } = options;
  const doc = await managers.appStickersManager.getAnimatedEmojiSticker(emoji);
  if(!doc) {
    div.classList.add('media-sticker-wrapper');
    throw new Error('no sticker');
  }

  return wrapSticker({
    ...options,
    doc,
    loop: false,
    play: true
  });
}
