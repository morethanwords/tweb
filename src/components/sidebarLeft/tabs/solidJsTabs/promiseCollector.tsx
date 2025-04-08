import {createContext, useContext, ParentProps} from 'solid-js';

type PromiseCollectorContextValue = {
  collect: (promise: Promise<any>) => void;
};

const PromiseCollectorContext = createContext<PromiseCollectorContextValue>({
  collect: () => {}
});

type PromiseCollectorProps = {
  onCollect: (promise: Promise<any>) => void;
};

export const PromiseCollector = (props: ParentProps<PromiseCollectorProps>) => {
  return (
    <PromiseCollectorContext.Provider value={{collect: props.onCollect}}>
      {props.children}
    </PromiseCollectorContext.Provider>
  );
};

PromiseCollector.createHelper = () => {
  const promises: Promise<any>[] = [];

  let collectPromise = (promise: Promise<any>) => {
    promises.push(promise);
  };

  return {
    onCollect: (promise: Promise<any>) => collectPromise(promise),
    await: () => {
      collectPromise = () => {}; // lose reference to the promises array
      return Promise.all(promises);
    }
  };
};

export const usePromiseCollector = () => useContext(PromiseCollectorContext);
