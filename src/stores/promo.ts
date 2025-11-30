import {createMemo} from 'solid-js';
import rootScope from '../lib/rootScope';
import {MyPromoData} from '../lib/appManagers/appPromoManager';
import {createStore, reconcile} from 'solid-js/store';

const [promoData, setPromoData] = createStore<MyPromoData>({pendingSuggestions: []});

rootScope.managers.appPromoManager.getPromoData()

rootScope.addEventListener('promo_data_update', (data) => {
  setPromoData(reconcile(data));
});

export function usePendingSuggestions() {
  return createMemo(() => new Set(promoData.pendingSuggestions));
}
