import {subscribeOn} from '../helpers/solid/subscribeOn';
import themeController from '../helpers/themeController';
import rootScope from '../lib/rootScope';
import {createSignal} from 'solid-js';

export default function useIsNightTheme() {
  const [isNight, setIsNight] = createSignal<boolean>(themeController.isNight());
  subscribeOn(rootScope)('theme_changed', () => {
    setIsNight(themeController.isNight());
  });
  return isNight;
}
