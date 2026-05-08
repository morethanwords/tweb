import {batch, createSignal, JSX, onCleanup, onMount} from 'solid-js';

export const AutoHeight = (props: {
  children: JSX.Element;
  duration?: number;
  easing?: string;
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
        overflow: 'hidden',
        transition: canHaveHeight() ? `height ${props.duration ?? 300}ms ${props.easing ?? 'ease'}` : 'none'
      }}
    >
      <div ref={contentRef}>{props.children}</div>
    </div>
  );
};
