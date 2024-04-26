/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import appDownloadManager from '../lib/appManagers/appDownloadManager';
import lottieLoader from '../lib/rlottie/lottieLoader';
import rootScope from '../lib/rootScope';
import {getEmojiToneIndex} from '../vendor/emoji';
import mediaSizes from './mediaSizes';
import {getMiddleware} from './middleware';
import {saveLottiePreview} from './saveLottiePreview';

export default function preloadAnimatedEmojiSticker(emoji: string, width?: number, height?: number) {
  return rootScope.managers.appStickersManager.preloadAnimatedEmojiSticker(emoji).then(({doc}) => {
    if(!doc) {
      return;
    }

    return appDownloadManager.downloadMedia({media: doc})
    .then(async(blob) => {
      const mediaSize = mediaSizes.active.emojiSticker;
      const toneIndex = getEmojiToneIndex(emoji);
      const middlewareHelper = getMiddleware();
      const animation = await lottieLoader.loadAnimationWorker({
        container: undefined,
        animationData: blob,
        width: width ?? mediaSize.width,
        height: height ?? mediaSize.height,
        name: 'doc' + doc.id,
        autoplay: false,
        loop: false,
        toneIndex,
        group: 'none',
        middleware: middlewareHelper.get()
      });

      animation.addEventListener('firstFrame', () => {
        saveLottiePreview(doc, animation.canvas[0], toneIndex);
        middlewareHelper.destroy();
      }, {once: true});
    });
  });
}
