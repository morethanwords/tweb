import {createRoot, createSignal} from 'solid-js';
import rootScope from '../lib/rootScope';

const [premium, setPremium] = createRoot(() => createSignal(rootScope.premium));

rootScope.addEventListener('premium_toggle', setPremium);
rootScope.managers.rootScope.getPremium().then(setPremium);

export default function usePremium() {
  return premium;
}
