/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import rootScope from '../../lib/rootScope';
import wrapSticker from './sticker'
import {Modify} from '../../types';

export default async function wrapStickerEmoji(options: Modify<Parameters<typeof wrapSticker>[0], {
  div: HTMLElement,
  doc?: never,
  loop?: never
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
    doc,
    play: true,
    loop: false,
    ...options
  });
}
