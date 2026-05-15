import {batch, createSignal, JSX, onCleanup, onMount} from 'solid-js';

export const AutoHeight = (props: {
  children: JSX.Element;
  duration?: number;
  overflowHidden?: boolean;
  easing?: JSX.CSSProperties['transition-property'];
}) => {
  let containerRef!: HTMLDivElement;
  let contentRef!: HTMLDivElement;

  const [canHaveHeight, setCanHaveHeight] = createSignal(false);
  const [height, setHeight] = createSignal(0);

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
      style={{
        height: canHaveHeight() ? `${height()}px` : 'auto',
        overflow: props.overflowHidden ? 'hidden' : undefined,
        transition: canHaveHeight() ? `height ${props.duration ?? 200}ms ${props.easing ?? 'ease'}` : 'none'
      }}
    >
      <div ref={contentRef}>{props.children}</div>
    </div>
  );
};
