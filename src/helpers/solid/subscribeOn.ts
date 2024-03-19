import {onCleanup} from 'solid-js';
import {ListenerElement} from '../listenerSetter';

export function subscribeOn<T extends ListenerElement>(obj: T): T['addEventListener'] {
  return ((event: string, callback: Function, options: any) => {
    // @ts-ignore
    obj.addEventListener(event, callback, options);

    onCleanup(() => {
      // @ts-ignore
      obj.removeEventListener(event, callback, options);
    });
  }) as any;
}
