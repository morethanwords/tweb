import {createSignal} from 'solid-js';
import mediaSizes, {ScreenSize} from '../helpers/mediaSizes';
import {subscribeOn} from '../helpers/solid/subscribeOn';

export default function useScreenSize() {
  const [screenSize, setScreenSize] = createSignal<ScreenSize>(mediaSizes.activeScreen);
  subscribeOn(mediaSizes)('changeScreen', (from, to) => setScreenSize(to));
  return screenSize;
}
