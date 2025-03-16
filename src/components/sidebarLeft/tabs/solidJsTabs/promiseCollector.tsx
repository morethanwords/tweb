import {createContext, useContext, ParentComponent} from 'solid-js';

type PromiseCollectorContextValue = {
  collect: (promise: Promise<any>) => void;
};

const PromiseCollectorContext = createContext<PromiseCollectorContextValue>({
  collect: () => {}
});

type PromiseCollectorProps = {
  onCollect: (promise: Promise<any>) => void;
};

export const PromiseCollector: ParentComponent<PromiseCollectorProps> = (props) => {
  return (
    <PromiseCollectorContext.Provider value={{collect: props.onCollect}}>
      {props.children}
    </PromiseCollectorContext.Provider>
  );
};

export const usePromiseCollector = () => useContext(PromiseCollectorContext);
