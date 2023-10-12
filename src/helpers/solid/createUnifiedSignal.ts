import {createSignal, Setter} from 'solid-js';

/**
 * do not use getter in JSX
 */
export default function createUnifiedSignal<T = any>(...args: Partial<Parameters<typeof createSignal<T>>>) {
  const [getter, setter] = createSignal<T>(...args);
  return <A extends Parameters<Setter<T>>>(...args: Partial<A>) => {
    // @ts-ignore
    if(args.length === 0) {
      return getter();
    }

    // @ts-ignore
    return setter(...args);
  };
}
