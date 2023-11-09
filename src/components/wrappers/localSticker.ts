/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Middleware} from '../../helpers/middleware';
import {MyDocument} from '../../lib/appManagers/appDocsManager';
import {AppManagers} from '../../lib/appManagers/managers';
import lottieLoader, {LottieAssetName} from '../../lib/rlottie/lottieLoader';
import RLottiePlayer from '../../lib/rlottie/rlottiePlayer';
import rootScope from '../../lib/rootScope';
import wrapSticker from './sticker';

export default async function wrapLocalSticker({
  container,
  emoji,
  width,
  height,
  assetName,
  middleware,
  managers = rootScope.managers,
  loop = false,
  autoplay = true
}: {
  container?: HTMLElement,
  doc?: MyDocument,
  // url?: string,
  emoji?: string,
  assetName?: LottieAssetName,
  width: number,
  height: number,
  managers?: AppManagers,
  middleware?: Middleware,
  autoplay?: boolean,
  loop?: boolean
}) {
  container ||= document.createElement('div');
  container.classList.add('media-sticker-wrapper');

  let playerPromise: Promise<RLottiePlayer>;
  if(assetName) {
    playerPromise = lottieLoader.loadAnimationAsAsset({
      container,
      loop,
      autoplay,
      width,
      height,
      noCache: true,
      middleware
    }, assetName).then((animation) => {
      return lottieLoader.waitForFirstFrame(animation);
    });
  } else if(emoji) {
    const doc = await managers.appStickersManager.getAnimatedEmojiSticker(emoji);
    if(doc) playerPromise = wrapSticker({
      doc,
      div: container,
      loop,
      play: autoplay,
      width,
      height,
      emoji,
      managers,
      middleware
    }).then((result) => {
      return result.render as Promise<RLottiePlayer>;
    });
  }

  return {container, promise: playerPromise};
}
