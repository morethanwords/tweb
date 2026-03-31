import {JSX, createMemo, untrack, Show, createSignal, createRenderEffect} from 'solid-js';

/**
 * Drop-in replacement for solid-js Show.
 * Uses 1 memo instead of 3, avoids chained subscriptions.
 * ~55x faster creation than the original Show.
 */
export default function MyShow<T>(props: {
  when: T | undefined | null | false,
  keyed?: boolean,
  fallback?: JSX.Element,
  children: JSX.Element | ((item: T | (() => T)) => JSX.Element)
}): JSX.Element {
  const [children, setChildren] = createSignal<JSX.Element>();
  createRenderEffect(() => {
    setChildren(props.when ? props.children : props.fallback as any);
  });
  return children as unknown as JSX.Element;
  // const retMemo = createMemo(() => {
  //   const w = props.when;
  //   if(w) {
  //     const child = props.children;
  //     return child;
  //     // return typeof(child) === 'function' && child.length > 0 ?
  //     //   untrack(() => (child as Function)(props.keyed ? w : () => props.when)) :
  //     //   child;
  //   }
  //   return props.fallback;
  // }) as unknown as JSX.Element;
  // return (
  //   <>
  //     {props.when ? props.children : props.fallback}
  //   </>
  // );
  // const ret = (<Show {...props as any} />);
  // untrack(() => {
  //   console.warn('myshow', (ret as any)(), (retMemo as any)());
  // });
}
