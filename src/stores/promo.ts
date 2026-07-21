import {createMemo, createRoot, createSignal} from 'solid-js';
import rootScope from '@lib/rootScope';
import {MyPromoData} from '@appManagers/appPromoManager';
import {createStore, reconcile} from 'solid-js/store';

const [promoData, setPromoData] = createStore<MyPromoData>({
  pendingSuggestions: [],
  dismissedSuggestions: []
});
const [promoDataLoaded, setPromoDataLoaded] = createRoot(() => createSignal(false));

let _loaded = false;
function loadPromoData() {
  if(!_loaded) {
    _loaded = true;
    rootScope.addEventListener('promo_data_update', (data) => {
      setPromoData(reconcile(data));
      setPromoDataLoaded(true);
    });

    rootScope.managers.appPromoManager.getPromoData().then((data) => {
      setPromoData(reconcile(data));
      setPromoDataLoaded(true);
    }).catch(() => {});
  }
}

export function usePendingSuggestions() {
  loadPromoData();

  return createMemo(() => new Set(promoData.pendingSuggestions));
}

export function useDismissedSuggestions() {
  loadPromoData();

  return createMemo(() => new Set(promoData.dismissedSuggestions));
}

export function usePromoDataLoaded() {
  loadPromoData();

  return promoDataLoaded;
}
