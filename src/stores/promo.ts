import {createMemo} from 'solid-js';
import rootScope from '@lib/rootScope';
import {MyPromoData} from '@appManagers/appPromoManager';
import {createStore, reconcile} from 'solid-js/store';

const [promoData, setPromoData] = createStore<MyPromoData>({pendingSuggestions: []});

let _loaded = false
export function usePendingSuggestions() {
  if(!_loaded) {
    _loaded = true;
    rootScope.managers.appPromoManager.getPromoData()

    rootScope.addEventListener('promo_data_update', (data) => {
      setPromoData(reconcile(data));
    });
  }

  return createMemo(() => new Set(promoData.pendingSuggestions));
}
