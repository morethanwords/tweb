import {createRoot, createSignal} from 'solid-js';
import rootScope from '../lib/rootScope';

const [premium, setPremium] = createRoot(() => createSignal(rootScope.premium));

const onAuth = () => {
  rootScope.managers.rootScope.getPremium().then(setPremium);
};

rootScope.addEventListener('premium_toggle', setPremium);
if(rootScope.myId) {
  onAuth();
} else {
  rootScope.addEventListener('user_auth', onAuth);
}

export default function usePremium() {
  return premium;
}
