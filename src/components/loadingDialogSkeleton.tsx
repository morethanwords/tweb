import {Component, createSignal, JSX, onCleanup} from 'solid-js';

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
  const [animating, setAnimating] = createSignal(false);

  // Add the animation after timeout to save some performance while quickly scrolling
  const timeout = self.setTimeout(() => {
    setAnimating(true);
  }, 1500);

  onCleanup(() => {
    self.clearTimeout(timeout);
  });

  return (
    <div
      class={`${styles.Container} loading-dialog-skeleton`}
      classList={{
        [props.class]: !!props.class,
        [styles['size' + props.size]]: true,
        [styles.noAvatar]: props.noAvatar,
        [styles.shimmer]: animating()
      }}
      style={props.style}
    >
      <div class={styles.Avatar} />
      <div class={styles.Content}>
        <div class={styles.Title}>
          <div class={styles.TitleLeft} style={{'--width': (pseudoRandomRange(props.seed, 100, 120) | 0) + 'px'}} />
          <div class={styles.TitleRight} style={{'--width': (pseudoRandomRange(props.seed, 20, 60) | 0) + 'px'}} />
        </div>
        <div class={styles.Subtitle} style={{'--width': (pseudoRandomRange(props.seed, 60, 200) | 0) + 'px'}} />
      </div>
    </div>
  );
};

export default LoadingDialogSkeleton;
