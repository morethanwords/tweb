import {Suspense, ParentProps, children, createMemo, JSX} from 'solid-js';

export default function MySuspense(props: ParentProps<{
  onReady?: () => void;
}>) {
  const resolvedChildren = children(() => (
    <Suspense>
      {props.children}
    </Suspense>
  ));

  const childrenMemo = createMemo<JSX.Element>((prev) => {
    const children = resolvedChildren() || prev;
    // console.log('children', children);
    if(children && !prev) {
      props.onReady?.();
    }
    return children;
  });

  return (
    <>
      {childrenMemo()}
    </>
  );
}
