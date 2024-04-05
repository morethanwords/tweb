import {resolveElements} from '@solid-primitives/refs';
import {createListTransition} from './createListTransition';
import {createEffect, createRoot, onCleanup, JSX, Accessor, FlowComponent} from 'solid-js';
import liteMode from '../liteMode';

export const TransitionGroup: FlowComponent<{
  noWait?: Accessor<boolean>,
  transitions: WeakMap<Element, Accessor<boolean>>
}> = (props) => {
  const observeElement = (element: Element, callback: () => void) => {
    const transition = props.transitions.get(element);
    createEffect((prev) => {
      const t = transition();
      if(prev || t) {
        if(!t) {
          callback();
        }

        return true;
      }
    });
  };

  const disposers: Map<Element, () => void> = new Map();
  const exitElement = (element: Element, callback: () => void) => {
    createRoot((dispose) => {
      disposers.set(element, dispose);

      observeElement(element, () => {
        dispose();
        callback();
      });

      onCleanup(() => {
        if(disposers.get(element) === dispose) {
          disposers.delete(element);
        }
      });
    });
  };

  onCleanup(() => {
    disposers.forEach((dispose) => dispose());
  });

  const listTransition = createListTransition(resolveElements(() => props.children).toArray, {
    exitMethod: 'keep-relative',
    onChange: ({added, removed, finishRemoved}) => {
      for(const element of added) {
        const dispose = disposers.get(element);
        dispose?.();
      }

      if(props.noWait?.() || !liteMode.isAvailable('animations')) {
        finishRemoved(removed);
        return;
      }

      const filtered: Element[] = [];
      for(const element of removed) {
        if(!props.transitions.has(element)) {
          filtered.push(element);
          continue;
        }

        exitElement(element, () => {
          finishRemoved([element]);
        });
      }

      if(filtered.length) {
        finishRemoved(filtered);
      }
    }
  }) as unknown as JSX.Element;

  return listTransition;
};
