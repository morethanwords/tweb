import {createRoot, createSignal} from 'solid-js';
import rootScope from '@lib/rootScope';
import type {UnconfirmedAuthorization} from '@appManagers/appAccountManager';

const [authorizations, setAuthorizations] = createRoot(() => {
  return createSignal<UnconfirmedAuthorization[]>([]);
});

let loaded = false;
let updateVersion = 0;

function fetchAuthorizations() {
  const version = updateVersion;
  rootScope.managers.appAccountManager.getUnconfirmedAuthorizations().then((current) => {
    if(version === updateVersion) {
      setAuthorizations(current);
    }
  });
}

export default function useUnconfirmedAuthorizations() {
  if(!loaded) {
    loaded = true;

    rootScope.addEventListener('unconfirmed_authorizations_update', (updated) => {
      ++updateVersion;
      setAuthorizations(updated);
    });

    // * the sign-ins waiting for a confirmation are the account's own
    rootScope.addEventListener('account_switched', () => {
      ++updateVersion;
      setAuthorizations([]);
      fetchAuthorizations();
    });

    fetchAuthorizations();
  }

  return authorizations;
}
