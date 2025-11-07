import {createContext, onCleanup, JSX, createEffect, children, untrack, createRenderEffect} from 'solid-js';
import {createStore} from 'solid-js/store';

export type ComponentContextValue<Kind extends string> = {
  register: (kind: Kind, element: JSX.Element) => JSX.Element,
  store: {[key in Kind]?: JSX.Element}
};

export default function createComponentContext<
  ContextValue extends ComponentContextValue<Kind>,
  Kind extends string
>() {
  const context = createContext<ContextValue>();

  return {
    context,
    createValue: () => {
      const [store, setStore] = createStore<ContextValue['store']>({});
      const register: ContextValue['register'] = (kind, element) => {
        const resolved = children(() => element);
        createRenderEffect(() => {
          setStore(kind as any, resolved() as any);
          // console.log('resolved', kind, resolved(), untrack(() => children(() => store[kind]))());
        });
        // setStore(kind as any, element as any);
        onCleanup(() => setStore(kind as any, undefined));
        return undefined;
        // return element;
      };

      const value: ComponentContextValue<Kind> = {
        register,
        store
      };

      return value;
    }
  };
}
