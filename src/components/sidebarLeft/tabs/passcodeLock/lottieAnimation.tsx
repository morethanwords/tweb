import {Component, createRenderEffect, mergeProps, onCleanup} from 'solid-js';

import type {LottieAssetName} from '../../../../lib/rlottie/lottieLoader';
import type RLottiePlayer from '../../../../lib/rlottie/rlottiePlayer';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';

import {usePromiseCollector} from './promiseCollector';

import styles from './common.module.scss';

const LottieAnimation: Component<{
  class?: string;
  name: LottieAssetName;
  size?: number;
}> = (inProps) => {
  const props = mergeProps({size: 100}, inProps);

  const {lottieLoader} = useHotReloadGuard();
  const promiseCollector = usePromiseCollector();

  let animationPromise: Promise<RLottiePlayer>;

  const div = (
    <div
      class={styles.LottieAnimation}
      classList={{
        [props.class]: !!props.class
      }}
      style={{
        '--size': props.size + 'px'
      }}
      onClick={() => {
        animationPromise?.then((animation) => {
          animation.playOrRestart();
        });
      }}
    />
  ) as HTMLDivElement;

  createRenderEffect(() => {
    animationPromise = lottieLoader.loadAnimationAsAsset(
      {
        container: div,
        loop: false,
        autoplay: true,
        width: props.size,
        height: props.size
      },
      props.name
    );

    onCleanup(() => {
      animationPromise?.then((animation) => {
        animation.remove();
      });
    });
  });

  promiseCollector.collect(animationPromise);

  return div;
}

export default LottieAnimation;
