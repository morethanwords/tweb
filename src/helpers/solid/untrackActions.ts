import {AnyFunction} from '../../types';
import {untrack} from 'solid-js';

export default function untrackActions<T extends Record<string, AnyFunction>>(actions: T) {
  for(const action in actions) {
    // @ts-ignore
    const callback = actions[action];
    // @ts-ignore
    actions[action] = (...args: any[]) => {
      // console.log('action', action, args);
      return untrack(() => callback(...args));
    };
  }

  return actions;
}
