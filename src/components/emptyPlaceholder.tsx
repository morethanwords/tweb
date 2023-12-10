/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {Middleware} from '../helpers/middleware';
import {LottieAssetName} from '../lib/rlottie/lottieLoader';
import wrapLocalSticker from './wrappers/localSticker';
import {Accessor, createRoot, JSX} from 'solid-js';

export default async function emptyPlaceholder({
  middleware,
  title,
  description,
  hide,
  assetName = 'UtyanSearch',
  width = 140,
  height = 140,
  isFullSize
}: {
  middleware: Middleware,
  title: Accessor<JSX.Element>,
  description: Accessor<JSX.Element>,
  hide: Accessor<boolean>,
  assetName?: LottieAssetName,
  width?: number,
  height?: number,
  isFullSize?: boolean
}) {
  const {container, promise} = await wrapLocalSticker({
    width,
    height,
    assetName,
    middleware,
    loop: true
  });

  if(!middleware()) {
    return;
  }

  await promise;
  if(!middleware()) {
    return;
  }

  container.classList.add('selector-empty-placeholder-sticker');

  let ret: JSX.Element;
  createRoot((disposer) => {
    middleware.onClean(disposer);
    ret = (
      <div class="selector-empty-placeholder" classList={{'hide': hide(), 'is-full': isFullSize}}>
        {container}
        <div class="selector-empty-placeholder-title">
          {title()}
        </div>
        {description() && (
          <div class="selector-empty-placeholder-description">
            {description()}
          </div>
        )}
      </div>
    );
  });

  return ret as HTMLElement;
}
