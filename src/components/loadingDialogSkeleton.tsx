
import {Component, JSX} from 'solid-js';

import styles from './loadingDialogSkeleton.module.scss';


function pseudoRandomRange(seed: number, min: number, max: number) {
  const x = Math.sin(seed * 10000 + 999999) * 10000;
  const rand = x - Math.floor(x);

  return min + rand * (max - min);
}

export type LoadingDialogSkeletonSize = 72 | 64;

const LoadingDialogSkeleton: Component<{
  class?: string;
  style?: JSX.CSSProperties;
  noAvatar?: boolean;
  size: LoadingDialogSkeletonSize;
  seed: number;
}> = (props) => {
  return (
    <div
      class={styles.Container}
      classList={{
        [props.class]: !!props.class,
        [styles['size' + props.size]]: true,
        [styles.noAvatar]: props.noAvatar
      }}
      style={props.style}
    >
      <div class={styles.Avatar} />
      <div class={styles.Content}>
        <div class={styles.Title}>
          <div class={styles.TitleLeft} style={{'--width': (pseudoRandomRange(props.seed, 100, 160) | 0) + 'px'}} />
          <div class={styles.TitleRight} style={{'--width': (pseudoRandomRange(props.seed, 20, 60) | 0) + 'px'}} />
        </div>
        <div class={styles.Subtitle} style={{'--width': (pseudoRandomRange(props.seed, 60, 240) | 0) + 'px'}} />
      </div>
    </div>
  );
};

export default LoadingDialogSkeleton;
