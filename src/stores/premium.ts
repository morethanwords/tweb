import {createRoot, createSignal} from 'solid-js';
import rootScope from '@lib/rootScope';

const [premium, setPremium] = createRoot(() => createSignal(rootScope.premium));

const onAuth = () => {
  rootScope.managers.rootScope.getPremium().then(setPremium);
};

rootScope.addEventListener('premium_toggle', setPremium);
// * the first time the account's Premium is known is no `premium_toggle` - it is not a change - and a
// * store read early (the chat list's folder tags read it as the app starts) has asked the managers
// * before they knew, and would keep that answer
rootScope.addEventListener('premium_toggle_private', ({isPremium}) => setPremium(isPremium));
if(rootScope.myId) {
  onAuth();
} else {
  rootScope.addEventListener('user_auth', onAuth);
}

export default function usePremium() {
  return premium;
}
