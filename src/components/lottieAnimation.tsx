import {Component, createRenderEffect, mergeProps, onCleanup, onMount} from 'solid-js';

import type {LottieAssetName, LottieLoader} from '@lib/rlottie/lottieLoader';
import RLottiePlayer, {RLottieOptions} from '@lib/rlottie/rlottiePlayer';

const LottieAnimation: Component<{
  lottieLoader: LottieLoader;
  class?: string;
  name: LottieAssetName;
  size?: number;
  needRaf?: boolean;
  restartOnClick?: boolean;
  rlottieOptions?: Partial<RLottieOptions>
  onPromise?: (promise: Promise<RLottiePlayer>) => void;
}> = (inProps) => {
  const props = mergeProps({size: 100}, inProps);

  let animationPromise: Promise<RLottiePlayer>;

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

    animationPromise = props.lottieLoader.loadAnimationAsAsset(
      {
        container: div,
        loop: false,
        autoplay: true,
        width: props.size,
        height: props.size,
        ...props.rlottieOptions
      },
      props.name
    );
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
