import {Suspense, ParentProps, children, createMemo, JSX, createSignal, createReaction} from 'solid-js';

export default function MySuspense(props: ParentProps<{
  onReady?: () => void;
}>) {
  const resolvedChildren = children(() => (
    <Suspense>
      {props.children}
    </Suspense>
  ));

  // const [ready, setReady] = createSignal(false);
  const childrenMemo = createMemo<JSX.Element>((prev) => {
    const children = resolvedChildren() || prev;
    // console.log('children', children);
    if(children && !prev) {
      // setReady(true);
      props.onReady?.();
    }
    return children;
  });

  // createReaction(ready)(() => {
  //   props.onReady?.();
  // });

  return (
    <>
      {childrenMemo()}
    </>
  );
}
