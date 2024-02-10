import {createRoot, createSignal} from 'solid-js';
import rootScope from '../lib/rootScope';

const [premium, setPremium] = createRoot(() => createSignal(rootScope.premium));

rootScope.addEventListener('premium_toggle', (premium) => {
  setPremium(premium);
});

export default function usePremium() {
  return premium;
}
