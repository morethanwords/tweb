import {JSX, createSignal} from 'solid-js';

export type LoadableList<T extends any = any> = {rendered: (HTMLElement | JSX.Element)[], values: T[], left: number, count: number, loadMore?: () => Promise<void>};
export const createLoadableList = <T extends any = any>(props: Partial<LoadableList<T>> = {}) => {
  return createSignal<LoadableList<T>>({
    rendered: [],
    values: [],
    left: 0,
    count: 0,
    ...props
  }, {equals: false});
};
