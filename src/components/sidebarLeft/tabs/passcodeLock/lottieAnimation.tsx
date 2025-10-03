import {Component} from 'solid-js';
import classNames from '../../../../helpers/string/classNames';
import type {LottieAssetName} from '../../../../lib/rlottie/lottieLoader';
import {useHotReloadGuard} from '../../../../lib/solidjs/hotReloadGuard';
import LottieAnimationBase from '../../../lottieAnimation';
import {usePromiseCollector} from '../../../solidJsTabs/promiseCollector';
import styles from './common.module.scss';


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
