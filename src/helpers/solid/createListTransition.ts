import type {ListTransitionOptions} from '@solid-primitives/transition-group';
import {Modify} from '../../types';
import {createSignal, useTransition, $TRACK, createMemo, Accessor, untrack} from 'solid-js';
import {isServer} from 'solid-js/web';
import noop from '../noop';

export function createListTransition<T extends object>(
  source: Accessor<readonly T[]>,
  options: Modify<ListTransitionOptions<T>, {exitMethod?: ListTransitionOptions<T>['exitMethod'] | 'keep-relative'}>
): Accessor<T[]> {
  const initSource = untrack(source);

  if(isServer) {
    const copy = initSource.slice();
    return () => copy;
  }

  const {onChange} = options;

  // if appear is enabled, the initial transition won't have any previous elements.
  // otherwise the elements will match and transition skipped, or transitioned if the source is different from the initial value
  let prevSet: ReadonlySet<T> = new Set(options.appear ? undefined : initSource);
  const exiting = new WeakSet<T>();

  const [toRemove, setToRemove] = createSignal<T[]>([], {equals: false});
  const [isTransitionPending] = useTransition();

  const finishRemoved: (els: T[]) => void =
    options.exitMethod === 'remove' ?
      noop :
      (els) => {
        setToRemove((p) => (p.push(...els), p));
        for(const el of els) exiting.delete(el);
      };

  type RemovedOptions = {
    elements: T[],
    element: T,
    previousElements: T[],
    previousIndex: number,
    side: 'start' | 'end'
  };

  let handleRemoved: (options: RemovedOptions) => void;
  if(options.exitMethod === 'remove') {
    handleRemoved = noop;
  } else if(options.exitMethod === 'keep-index') {
    handleRemoved = (options) => options.elements.splice(options.previousIndex, 0, options.element);
  } else if(options.exitMethod === 'keep-relative') {
    handleRemoved = (options) => {
      let index: number;
      if(options.side === 'start') {
        index = options.previousIndex;
      } else {
        // index = options.elements.length - (options.previousElements.length - 1 - options.previousIndex);
        index = options.elements.length;
      }

      options.elements.splice(index, 0, options.element);
    };
  } else {
    handleRemoved = (options) => options.elements.push(options.element);
  }

  const compute = (prev: T[]) => {
    const elsToRemove = toRemove();
    const sourceList = source();
    (sourceList as any)[$TRACK]; // top level store tracking

    if(untrack(isTransitionPending)) {
      // wait for pending transition to end before animating
      isTransitionPending();
      return prev;
    }

    if(elsToRemove.length) {
      const next = prev.filter((e) => !elsToRemove.includes(e));
      elsToRemove.length = 0;
      onChange({list: next, added: [], removed: [], unchanged: next, finishRemoved});
      return next;
    }

    return untrack(() => {
      const nextSet: ReadonlySet<T> = new Set(sourceList);
      const next: T[] = sourceList.slice();

      const added: T[] = [];
      const removed: T[] = [];
      const unchanged: T[] = [];

      for(const el of sourceList) {
        (prevSet.has(el) ? unchanged : added).push(el);
      }

      const removedOptions: Modify<RemovedOptions, {element?: T, previousIndex?: number}> = {
        elements: next,
        previousElements: prev,
        side: 'start'
      };

      let nothingChanged = !added.length;
      for(let i = 0; i < prev.length; ++i) {
        const el = prev[i]!;
        if(!nextSet.has(el)) {
          if(!exiting.has(el)) {
            removed.push(el);
            exiting.add(el);
          }

          removedOptions.element = el;
          removedOptions.previousIndex = i;

          handleRemoved(removedOptions as RemovedOptions);
        } else {
          removedOptions.side = 'end';
        }

        if(nothingChanged && el !== next[i]) {
          nothingChanged = false;
        }
      }

      // skip if nothing changed
      if(!removed.length && nothingChanged) {
        return prev;
      }

      onChange({list: next, added, removed, unchanged, finishRemoved});

      prevSet = nextSet;
      return next;
    });
  };

  return createMemo(compute, options.appear ? [] : initSource.slice());
}
