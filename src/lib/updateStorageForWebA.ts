import tsNow from '../helpers/tsNow';
import {TrueDcId} from '../types';

import AccountController from './accounts/accountController';
import {getCurrentAccount} from './accounts/getCurrentAccount';
import sessionStorage from './sessionStorage';

export async function updateStorageForWebA() {
  const accountNumber = getCurrentAccount();
  const accountData = await AccountController.get(accountNumber);
  if(!accountData) return;

  for(let i = 1; i <= 5; i++) {
    const authKeyKey = `dc${i as TrueDcId}_auth_key` as const;
    const serverSaltKey = `dc${i as TrueDcId}_server_salt` as const;

    if(accountData[authKeyKey]) await sessionStorage.set({
      [authKeyKey]: accountData[authKeyKey]
    });
    if(accountData[serverSaltKey]) await sessionStorage.set({
      [serverSaltKey]: accountData[serverSaltKey]
    });
  }

  if(accountData['auth_key_fingerprint']) await sessionStorage.set({
    auth_key_fingerprint: accountData['auth_key_fingerprint']
  });

  if(accountData['userId']) await sessionStorage.set({
    user_auth: {
      date: tsNow(true),
      id: accountData.userId,
      dcID: accountData.dcId || 0
    }
  });
  if(accountData['dcId']) await sessionStorage.set({
    dc: accountData.dcId
  });
}
