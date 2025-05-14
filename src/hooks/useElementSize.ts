import {Accessor, createMemo, createRenderEffect, createRoot, onCleanup} from 'solid-js';
import {createStore, Store} from 'solid-js/store';

import pickKeys from '../helpers/object/pickKeys';


type SizeRoot = {
  count: number;
  store: Store<{width: number, height: number}>;
  dispose: () => void;
};

const NULL_KEY = {};

const map = new WeakMap<Element | typeof NULL_KEY, SizeRoot>();

const createSizeRoot = (element: Accessor<Element>) => createRoot(dispose => {
  const [store, setStore] = createStore({width: 0, height: 0});

  createRenderEffect(() => {
    if(!element()) return;

    setStore(pickKeys(element().getBoundingClientRect(), ['width', 'height']));

    const resizeObserver = new ResizeObserver(([entry]) => {
      setStore(pickKeys(entry.contentRect, ['width', 'height']));
    });

    resizeObserver.observe(element());

    onCleanup(() => {
      resizeObserver.disconnect();
    });
  });

  return {
    count: 0,
    store,
    dispose
  };
});

export default function useElementSize(element: Accessor<Element>) {
  const root = createMemo(() => {
    const key = element() || NULL_KEY;

    const root = map.get(key) || createSizeRoot(element);

    if(!map.has(key)) map.set(key, root);

    root.count++;

    onCleanup(() => {
      root.count--;
      if(!root.count) {
        root.dispose();
        map.delete(key);
      }
    });

    return root;
  });

  return {
    get width() {
      return root().store.width;
    },
    get height() {
      return root().store.height;
    }
  };
}
