import {createMemo, createRoot, createSignal} from 'solid-js';
import rootScope from '@lib/rootScope';
import {MyPromoData} from '@appManagers/appPromoManager';
import {createStore, reconcile} from 'solid-js/store';

const createEmptyPromoData = (): MyPromoData => ({
  pendingSuggestions: [],
  dismissedSuggestions: []
});

const [promoData, setPromoData] = createStore<MyPromoData>(createEmptyPromoData());
const [promoDataLoaded, setPromoDataLoaded] = createRoot(() => createSignal(false));

function fetchPromoData() {
  rootScope.managers.appPromoManager.getPromoData().then((data) => {
    setPromoData(reconcile(data));
    setPromoDataLoaded(true);
  }).catch(() => {});
}

let _loaded = false;
function loadPromoData() {
  if(!_loaded) {
    _loaded = true;
    rootScope.addEventListener('promo_data_update', (data) => {
      setPromoData(reconcile(data));
      setPromoDataLoaded(true);
    });

    // * the suggestions are the account's own
    rootScope.addEventListener('account_switched', () => {
      setPromoData(reconcile(createEmptyPromoData()));
      setPromoDataLoaded(false);
      fetchPromoData();
    });

    fetchPromoData();
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
