import classNames from '../helpers/string/classNames';
import lottieLoader, {LottieAssetName} from '../lib/rlottie/lottieLoader';
import LottieAnimation from './lottieAnimation';
import {Show, JSX, children} from 'solid-js';
import styles from './stickerAndTitle.module.scss';

export type StickerAndTitleProps = {
  sticker: {
    name: LottieAssetName,
    size?: number
  },
  title?: JSX.Element,
  subtitle?: JSX.Element,
  subtitleSecondary?: boolean,
  onReady?: () => void
};

export default function StickerAndTitle(props: StickerAndTitleProps) {
  const titleChildren = children(() => props.title);
  const subtitleChildren = children(() => props.subtitle);
  return (
    <div class={styles.container}>
      <div class={styles.lottieWrapper}>
        <LottieAnimation
          class={styles.lottieAnimation}
          size={props.sticker.size || 130}
          lottieLoader={lottieLoader}
          restartOnClick
          name={props.sticker.name}
          onPromise={(promise) => {
            promise.then(props.onReady);
          }}
        />
      </div>
      <Show when={titleChildren()}>
        <div class={classNames(styles.title, 'text-center text-overflow-wrap')}>
          {titleChildren()}
        </div>
      </Show>
      <Show when={subtitleChildren()}>
        <div
          class={classNames(
            styles.subtitle,
            props.subtitleSecondary && styles.secondary,
            'text-center'
          )}
        >
          {subtitleChildren()}
        </div>
      </Show>
    </div>
  );
}
