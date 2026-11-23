import {JSX, createSignal, Setter} from 'solid-js';

export type LoadableList<T extends any = any> = {rendered: (HTMLElement | JSX.Element)[], values: T[], left: number, count: number, loadMore?: () => Promise<void>};

const singleFlightLoaders = new WeakSet<Function>();

/**
 * A list's next page asked for once at a time: a call while one is on its way gets that one. The page is asked for
 * from where the previous one ended, which only an answer moves - a second request in the meantime asks for the same
 * page again and its rows come twice (a quick second "Show more", or one during the first load).
 */
function singleFlight(loadMore: LoadableList['loadMore']) {
  if(!loadMore || singleFlightLoaders.has(loadMore)) {
    return loadMore;
  }

  let pending: Promise<void>;
  const guarded = () => pending ??= Promise.resolve(loadMore()).finally(() => {
    pending = undefined;
  });
  singleFlightLoaders.add(guarded);
  return guarded;
}

export const createLoadableList = <T extends any = any>(props: Partial<LoadableList<T>> = {}) => {
  const [list, setList] = createSignal<LoadableList<T>>({
    rendered: [],
    values: [],
    left: 0,
    count: 0,
    ...props,
    loadMore: singleFlight(props.loadMore)
  }, {equals: false});

  // * a loader given later, with the page it starts from, is guarded the same way - before anything sees it
  const guard = (value: LoadableList<T>) => {
    value.loadMore = singleFlight(value.loadMore);
    return value;
  };
  const setGuardedList = ((value: LoadableList<T> | ((prev: LoadableList<T>) => LoadableList<T>)) => {
    return setList(typeof value === 'function' ? (prev) => guard(value(prev)) : guard(value));
  }) as Setter<LoadableList<T>>;

  return [list, setGuardedList] as const;
};
