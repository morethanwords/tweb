import {createEffect, onCleanup, onMount, Signal} from 'solid-js';
import PreloaderRing from '@components/preloaderRing';
import classNames from '@helpers/string/classNames';
import I18n from '@lib/langPack';
import styles from '@components/mediaEditor/renderProgressCircle.module.scss';

// A video or a GIF being made: the ring of dots a download has, with the share done in its middle.
// `fill`: over the whole of a small preview that is dimmed already, rather than a disc in its middle.
export default function RenderProgressCircle(props: {creationProgress: Signal<number>, fill?: boolean}) {
  const [progress] = props.creationProgress;

  let ringElement: HTMLDivElement;
  const element = (
    <div
      class={classNames(styles.wrap, props.fill && styles.fill)}
      role="progressbar"
      aria-label={I18n.format('Loading', true)}
      aria-valuenow={Math.round(progress() * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div ref={ringElement} class={styles.ring} />
    </div>
  );

  const ring = new PreloaderRing(ringElement, {percent: true});
  createEffect(() => ring.setTarget(progress()));
  // watched from the start: out of the document it waits to be put in
  onMount(() => ring.onAttach());
  onCleanup(() => ring.halt());

  return element;
}
