import {createSignal, onCleanup} from 'solid-js';

import {useHotReloadGuard} from '../../../../../lib/solidjs/hotReloadGuard';
import ListenerSetter from '../../../../../helpers/listenerSetter';


const useIsPremium = () => {
  const {rootScope} = useHotReloadGuard();

  const [isPremium, setIsPremium] = createSignal(rootScope.premium);

  // (window as any).setIsPremium = setIsPremium;

  const listenerSetter = new ListenerSetter();

  listenerSetter.add(rootScope)('premium_toggle', (newValue) => {
    setIsPremium(newValue);
  });

  onCleanup(() => {
    listenerSetter.removeAll();
  });

  return isPremium;
};

export default useIsPremium;
