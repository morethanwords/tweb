import appNavigationController from '@components/appNavigationController';

import {CURRENT_ACCOUNT_QUERY_PARAM} from '@lib/accounts/constants';
import {ActiveAccountNumber} from '@lib/accounts/types';

export function changeAccount(
  accountNumber: ActiveAccountNumber,
  newTab = false,
  preserveHash?: boolean
) {
  const url = new URL(location.href);

  if(accountNumber === 1) url.searchParams.delete(CURRENT_ACCOUNT_QUERY_PARAM);
  else url.searchParams.set(CURRENT_ACCOUNT_QUERY_PARAM, accountNumber + '');

  if(!preserveHash) url.hash = '';

  if(newTab) {
    window.open(url, '_blank');
  } else {
    appNavigationController.reload(url);
  }
}
