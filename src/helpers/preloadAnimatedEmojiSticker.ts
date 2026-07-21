import appDownloadManager from '@lib/appDownloadManager';
import lottieLoader from '@lib/lottie/lottieLoader';
import rootScope from '@lib/rootScope';
import {getEmojiToneIndex} from '@vendor/emoji';
import mediaSizes from '@helpers/mediaSizes';
import {getMiddleware} from '@helpers/middleware';
import {saveLottiePreviewFromPlayer} from '@helpers/saveLottiePreview';

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
        saveLottiePreviewFromPlayer(doc, animation, toneIndex).finally(() => {
          middlewareHelper.destroy();
        });
      }, {once: true});
    });
  });
}
