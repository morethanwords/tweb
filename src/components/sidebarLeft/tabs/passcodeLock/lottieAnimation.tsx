import {createEffect, createRenderEffect, mergeProps, onCleanup} from 'solid-js';

import type {LottieAssetName} from '../../../../lib/rlottie/lottieLoader';
import type RLottiePlayer from '../../../../lib/rlottie/rlottiePlayer';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';

import styles from './common.module.scss';
import { usePromiseCollector } from './promiseCollector';

type LottieAnimationProps = {
  class?: string;
  name: LottieAssetName;
  size?: number;
};

export function LottieAnimation(inProps: LottieAnimationProps) {
  const props = mergeProps({size: 100}, inProps);

  const {lottieLoader} = useHotReloadGuard();
  const promiseCollector = usePromiseCollector();

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
        animationPromise.then((animation) => {
          animation.playOrRestart();
        });
      }}
    />
  ) as HTMLDivElement;

  let animationPromise: Promise<RLottiePlayer>;

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
    promiseCollector.collect(animationPromise);

    onCleanup(() => {
      animationPromise.then((animation) => {
        animation.remove();
      });
    });
  });

  return div;
}
