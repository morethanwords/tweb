import {Component, createRenderEffect, mergeProps, onCleanup} from 'solid-js';

import type {LottieAssetName, LottieLoader} from '../lib/rlottie/lottieLoader';
import RLottiePlayer, {RLottieOptions} from '../lib/rlottie/rlottiePlayer';

const LottieAnimation: Component<{
  lottieLoader: LottieLoader;
  class?: string;
  name: LottieAssetName;
  size?: number;
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

  createRenderEffect(() => {
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

    onCleanup(() => {
      animationPromise?.then((animation) => {
        animation.remove();
      });
    });
  });

  props.onPromise?.(animationPromise);

  return div;
}

export default LottieAnimation;
