/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import { MyDocument } from "../../lib/appManagers/appDocsManager";
import { AppManagers } from "../../lib/appManagers/managers";
import rootScope from "../../lib/rootScope";
import wrapSticker from "./sticker";

export default async function wrapLocalSticker({emoji, width, height, managers = rootScope.managers}: {
  doc?: MyDocument,
  url?: string,
  emoji?: string,
  width: number,
  height: number,
  managers?: AppManagers
}) {
  const container = document.createElement('div');

  const doc = await managers.appStickersManager.getAnimatedEmojiSticker(emoji);
  if(doc) {
    wrapSticker({
      doc,
      div: container,
      loop: false,
      play: true,
      width,
      height,
      emoji,
      managers
    }).then(() => {
      // this.animation = player;
    });
  } else {
    container.classList.add('media-sticker-wrapper');
  }

  return {container};
}
