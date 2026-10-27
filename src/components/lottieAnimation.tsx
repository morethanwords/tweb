import {Component, createRenderEffect, mergeProps, onCleanup, onMount} from 'solid-js';

import type {LottieAssetName, LottieLoader, PreloadedLottieAsset} from '@lib/lottie/lottieLoader';
import LottiePlayer, {LottieOptions} from '@lib/lottie/lottiePlayer';

const LottieAnimation: Component<{
  lottieLoader: LottieLoader,
  class?: string,
  /** A built-in asset to fetch now. Mutually exclusive with `animationData`. */
  name?: LottieAssetName,
  /** An asset whose fetch started earlier (a tab's `getInitArgs`). */
  animationData?: PreloadedLottieAsset,
  size?: number,
  needRaf?: boolean,
  restartOnClick?: boolean,
  lottieOptions?: Partial<LottieOptions>,
  onPromise?: (promise: Promise<LottiePlayer>) => void
}> = (inProps) => {
  const props = mergeProps({size: 100}, inProps);

  let animationPromise: Promise<LottiePlayer>;

  const div = (
    <div
      classList={{
        [props.class]: !!props.class
      }}
      style={{
        '--size': props.size + 'px'
      }}
      onClick={() => {
        if(!props.restartOnClick) return;
        animationPromise?.then((animation) => {
          animation.playOrRestart();
        });
      }}
    />
  ) as HTMLDivElement;

  let cleanup = false
  function loadAnimation() {
    if(props.needRaf && !div.isConnected && !cleanup) {
      requestAnimationFrame(loadAnimation);
      return
    }

    const params: Omit<LottieOptions, 'animationData' | 'name'> = {
      container: div,
      loop: false,
      autoplay: true,
      width: props.size,
      height: props.size,
      group: 'none',
      ...props.lottieOptions
    };
    animationPromise = props.animationData ?
      props.animationData.then((load) => load(params)) :
      props.lottieLoader.loadAnimationAsAsset(params, props.name);
    props.onPromise?.(animationPromise);
  }

  createRenderEffect(loadAnimation);

  onCleanup(() => {
    cleanup = true;
    animationPromise?.then((animation) => {
      animation.remove();
    });
  });

  return div;
}

export default LottieAnimation;
