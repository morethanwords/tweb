import {Accessor, batch, createMemo, createReaction, createRoot, createSignal, onCleanup} from 'solid-js';
import {Middleware} from '../helpers/middleware';
import useDynamicCachedValue from '../helpers/solid/useDynamicCachedValue';
import rootScope, {BroadcastEventsListeners} from '../lib/rootScope';
import formatStarsAmount from '../lib/appManagers/utils/payments/formatStarsAmount';
import bigInt from 'big-integer';

const [stars, setStars] = createSignal<Long>();
const [reservedStars, setReservedStars] = createSignal<number>(0);

const [tonBalance, setTonBalance] = createSignal<Long>();
const [reservedTonBalance, setReservedTonBalance] = createSignal<number>(0);

const fetchStars = () => rootScope.managers.appPaymentsManager.getStarsStatus(true).then((starsStatus) => setStars(formatStarsAmount(starsStatus.balance)));
const fetchTonBalance = () => rootScope.managers.appPaymentsManager.getStarsStatusTon(true).then((starsStatus) => setTonBalance(starsStatus.balance.amount));

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
let cachedTon: Accessor<Long>;
function _useStars(ton: boolean) {
  if(ton && cachedTon) {
    return cachedTon;
  } else if(!ton && cached) {
    return cached;
  }

  return useDynamicCachedValue(() => _useStars.name + (ton ? 'ton' : ''), () => {
    (ton ? fetchTonBalance : fetchStars)();
    const handler: BroadcastEventsListeners['stars_balance'] = ({balance, fulfilledReservedStars, ton}) => {
      batch(() => {
        (ton ? setTonBalance : setStars)(balance);
        if(fulfilledReservedStars) (ton ? setReservedTonBalance : setReservedStars)(prev => Math.max(0, prev - fulfilledReservedStars));
      });
    }
    rootScope.addEventListener('stars_balance', handler);

    // const interval = setInterval(() => {
    //   fetchStars();
    // }, 60e3);

    onCleanup(() => {
      // clearInterval(interval);
      rootScope.removeEventListener('stars_balance', handler);
    });

    // return stars;
    return createMemo(() => {
      if(ton) {
        return bigInt(tonBalance() as string).minus(reservedTonBalance()).toString();
      }
      return +stars() - +reservedStars();
    });
  })();
}

// * cache once and for all
export default function useStars(ton = false) {
  if(ton) {
    return cachedTon ??= createRoot(() => _useStars(ton));
  }

  return cached ??= createRoot(() => _useStars(ton));
}
