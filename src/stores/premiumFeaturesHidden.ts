import {createSignal} from 'solid-js';
import apiManagerProxy from '@lib/apiManagerProxy';
import usePremium from '@stores/premium';

/**
 * Whether Premium is not to be offered at all - its purchase is blocked, and the account has none
 * (`apiManagerProxy.isPremiumFeaturesHidden`). Hidden until that is known, so that nothing which
 * offers it shows up only to be taken away
 */
export default function usePremiumFeaturesHidden() {
  const premium = usePremium();
  const [purchaseBlocked, setPurchaseBlocked] = createSignal(true);
  Promise.resolve(apiManagerProxy.isPremiumPurchaseBlocked()).then(setPurchaseBlocked);
  return () => purchaseBlocked() && !premium();
}
