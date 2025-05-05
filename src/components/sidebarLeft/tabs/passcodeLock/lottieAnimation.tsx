import {Component, createRenderEffect, mergeProps, onCleanup} from 'solid-js';

import type {LottieAssetName} from '../../../../lib/rlottie/lottieLoader';
import type RLottiePlayer from '../../../../lib/rlottie/rlottiePlayer';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';
import LottieAnimationBase from '../../../lottieAnimation';
import {usePromiseCollector} from '../solidJsTabs/promiseCollector';

import styles from './common.module.scss';
import classNames from '../../../../helpers/string/classNames';


const LottieAnimation: Component<{
  class?: string;
  name: LottieAssetName;
  size?: number;
}> = (props) => {
  const {lottieLoader} = useHotReloadGuard();
  const promiseCollector = usePromiseCollector();

  return (
    <LottieAnimationBase
      lottieLoader={lottieLoader}
      onPromise={(promise) => promiseCollector.collect(promise)}
      class={classNames(props.class, styles.LottieAnimation)}
      restartOnClick
      {...props}
    />
  );
}

export default LottieAnimation;
