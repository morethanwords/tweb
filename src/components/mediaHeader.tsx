import {JSX, Ref, Show} from 'solid-js';

import LottieAnimation from '@components/lottieAnimation';
import classNames from '@helpers/string/classNames';
import lottieLoader, {LottieAssetName} from '@lib/lottie/lottieLoader';

import styles from '@components/mediaHeader.module.scss';

/**
 * Compound header used by auth cards, intro popups, and other "icon → title →
 * subtitle" surfaces. Each piece is a sub-component with its own props, so a
 * caller picks only what they need:
 *
 * ```tsx
 * <MediaHeader>
 *   <MediaHeader.Sticker name="key" size={120} />
 *   <MediaHeader.Title>{i18n('Login.Title')}</MediaHeader.Title>
 *   <MediaHeader.Subtitle>{i18n('Login.StartText')}</MediaHeader.Subtitle>
 * </MediaHeader>
 * ```
 *
 * `MediaHeader.Sticker` accepts either a built-in lottie asset (`name`) or a
 * custom JSX element (`element`) — useful for SVG logos, canvases, monkey
 * components, etc. Cards that need an imperative ref to the slot can pass a
 * stable container element via `element`.
 */
function MediaHeader(props: {class?: string, children?: JSX.Element}): JSX.Element {
  return (
    <div class={classNames(styles.container, props.class)}>
      {props.children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sticker                                                            */
/* ------------------------------------------------------------------ */

export type MediaHeaderStickerProps = {
  /** Built-in lottie asset name. Mutually exclusive with `element`. */
  name?: LottieAssetName,
  /** Custom JSX (SVG, canvas, monkey container, …). Mutually exclusive with `name`. */
  element?: JSX.Element | (() => JSX.Element),
  /** Sticker size in px (drives `--sticker-size` and the lottie's render dimensions). Default 130. */
  size?: number,
  /** Extra class on the sticker wrapper. */
  class?: string,
  /** Fires once the sticker is ready to display (lottie's first frame for `name`, immediately for `element`). */
  onReady?: () => void,
  ref?: Ref<HTMLDivElement>
};

MediaHeader.Sticker = function MediaHeaderSticker(props: MediaHeaderStickerProps): JSX.Element {
  const size = () => props.size || 130;

  if(props.element) {
    props.onReady?.();
  }

  return (
    <div
      class={classNames(styles.sticker, props.class)}
      style={{'--sticker-size': size() + 'px'}}
      ref={props.ref}
    >
      <Show
        when={props.name}
        fallback={typeof(props.element) === 'function' ? props.element() : props.element}
      >
        <LottieAnimation
          class={styles.lottie}
          size={size()}
          lottieLoader={lottieLoader}
          restartOnClick
          name={props.name}
          onPromise={(promise) => {
            promise.then(props.onReady);
          }}
        />
      </Show>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Title                                                              */
/* ------------------------------------------------------------------ */

export type MediaHeaderTitleProps = {
  class?: string,
  children?: JSX.Element
};

MediaHeader.Title = function MediaHeaderTitle(props: MediaHeaderTitleProps): JSX.Element {
  return (
    <div class={classNames(styles.title, 'text-center text-overflow-wrap', props.class)}>
      {props.children}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Subtitle                                                           */
/* ------------------------------------------------------------------ */

export type MediaHeaderSubtitleProps = {
  class?: string,
  /** Render in the smaller secondary-text variant (used by intro popups). */
  secondary?: boolean,
  children?: JSX.Element
};

MediaHeader.Subtitle = function MediaHeaderSubtitle(props: MediaHeaderSubtitleProps): JSX.Element {
  return (
    <div
      class={classNames(
        styles.subtitle,
        props.secondary && styles.secondary,
        'text-center',
        props.class
      )}
    >
      {props.children}
    </div>
  );
};

export default MediaHeader;
