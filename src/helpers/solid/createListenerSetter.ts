import ListenerSetter from '@helpers/listenerSetter';
import {onCleanup} from 'solid-js';

export default function createListenerSetter() {
  const listenerSetter = new ListenerSetter();
  onCleanup(() => listenerSetter.removeAll());
  return listenerSetter;
}
