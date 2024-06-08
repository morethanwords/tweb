import {createSignal, onCleanup} from 'solid-js';
import useDynamicCachedValue from '../helpers/solid/useDynamicCachedValue';
import rootScope from '../lib/rootScope';

const [stars, setStars] = createSignal<Long>();

const fetchStars = () => rootScope.managers.appPaymentsManager.getStarsStatus(true).then((starsStatus) => setStars(starsStatus.balance));

export default function useStars() {
  return useDynamicCachedValue(() => useStars.name, () => {
    fetchStars();
    rootScope.addEventListener('stars_balance', setStars);

    const interval = setInterval(() => {
      fetchStars();
    }, 60e3);

    onCleanup(() => {
      clearInterval(interval);
      rootScope.removeEventListener('stars_balance', setStars);
    });

    return stars;
  })();
}
