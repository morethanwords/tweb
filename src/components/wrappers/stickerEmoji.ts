/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { AppManagers } from "../../lib/appManagers/managers";
import rootScope from "../../lib/rootScope";
import wrapSticker from "./sticker"

export default async function wrapStickerEmoji({emoji, div, width, height, managers = rootScope.managers}: {
  emoji: string,
  div: HTMLElement,
  managers?: AppManagers,
  width: number,
  height: number
}) {
  const doc = await managers.appStickersManager.getAnimatedEmojiSticker(emoji);
  if(!doc) {
    div.classList.add('media-sticker-wrapper');
    throw new Error('no sticker');
  }

  return wrapSticker({
    doc,
    div,
    emoji,
    width,
    height,
    loop: false,
    play: true
  });
}
