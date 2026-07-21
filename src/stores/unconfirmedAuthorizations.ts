import {createRoot, createSignal} from 'solid-js';
import rootScope from '@lib/rootScope';
import type {UnconfirmedAuthorization} from '@appManagers/appAccountManager';

const [authorizations, setAuthorizations] = createRoot(() => {
  return createSignal<UnconfirmedAuthorization[]>([]);
});

let loaded = false;

export default function useUnconfirmedAuthorizations() {
  if(!loaded) {
    loaded = true;
    let updateVersion = 0;

    rootScope.addEventListener('unconfirmed_authorizations_update', (updated) => {
      ++updateVersion;
      setAuthorizations(updated);
    });

    const version = updateVersion;
    rootScope.managers.appAccountManager.getUnconfirmedAuthorizations().then((current) => {
      if(version === updateVersion) {
        setAuthorizations(current);
      }
    });
  }

  return authorizations;
}
