import {Accessor, createMemo, createReaction, createRoot, createSignal, onCleanup} from 'solid-js';
import {Middleware} from '../helpers/middleware';
import useDynamicCachedValue from '../helpers/solid/useDynamicCachedValue';
import rootScope from '../lib/rootScope';

const [stars, setStars] = createSignal<Long>();
const [reservedStars, setReservedStars] = createSignal<number>(0);

const fetchStars = () => rootScope.managers.appPaymentsManager.getStarsStatus(true).then((starsStatus) => setStars(starsStatus.balance));

export function prefetchStars(middleware: Middleware) {
  return createRoot((dispose) => {
    middleware.onClean(dispose);
    const stars = useStars();
    if(stars() !== undefined) {
      return stars();
    }

    return new Promise<Long>((resolve) => {
      createReaction(() => resolve(stars()))(stars);
    });
  });
}

export {setReservedStars};

let cached: Accessor<Long>;
function _useStars() {
  if(cached) {
    return cached;
  }

  return useDynamicCachedValue(() => _useStars.name, () => {
    fetchStars();
    rootScope.addEventListener('stars_balance', setStars);

    // const interval = setInterval(() => {
    //   fetchStars();
    // }, 60e3);

    onCleanup(() => {
      // clearInterval(interval);
      rootScope.removeEventListener('stars_balance', setStars);
    });

    // return stars;
    return createMemo(() => +stars() - +reservedStars());
  })();
}

// * cache once and for all
export default function useStars() {
  return cached ??= createRoot(() => _useStars());
}
