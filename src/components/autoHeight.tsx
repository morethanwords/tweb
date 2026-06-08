import classNames from '@helpers/string/classNames';
import {batch, createMemo, createSignal, JSX, mergeProps, onCleanup, onMount} from 'solid-js';
import styles from './autoHeight.module.scss';


export const AutoHeight = (inProps: {
  children: JSX.Element;
  duration?: number;
  overflowHidden?: boolean;
  easing?: JSX.CSSProperties['transition-property'];
  outerClass?: string;
  hasTransition?: boolean;
}) => {
  const props = mergeProps({hasTransition: true}, inProps);

  let containerRef!: HTMLDivElement;
  let contentRef!: HTMLDivElement;

  const [canHaveHeight, setCanHaveHeight] = createSignal(false);
  const [height, setHeight] = createSignal(0);

  const canHaveHeightAndTransition = createMemo(() => canHaveHeight() && props.hasTransition);

  onMount(() => {
    const observer = new ResizeObserver(() => {
      batch(() => {
        setCanHaveHeight(true);
        setHeight(contentRef.offsetHeight);
      });
    });

    observer.observe(contentRef);

    onCleanup(() => observer.disconnect());
  });

  return (
    <div
      ref={containerRef}
      class={classNames(props.outerClass, styles.outer)}
      classList={{
        [styles.overflowHidden]: props.overflowHidden,
        [styles.hasTransition]: canHaveHeightAndTransition()
      }}
      style={{
        '--auto-height': canHaveHeightAndTransition() ? `${height()}px` : undefined
      }}
    >
      <div ref={contentRef}>{props.children}</div>
    </div>
  );
};
