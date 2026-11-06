import {createSignal} from 'solid-js';
import {subscribeOn} from '@helpers/solid/subscribeOn';
import themeController from '@helpers/themeController';
import rootScope from '@lib/rootScope';

/** The base theme the app is drawn in, following it when it turns to another. */
export default function useBaseTheme() {
  const get = () => themeController.getBaseThemeForName(themeController.getTheme().name);
  const [baseTheme, setBaseTheme] = createSignal(get());
  subscribeOn(rootScope)('theme_changed', () => setBaseTheme(get()));
  return baseTheme;
}
