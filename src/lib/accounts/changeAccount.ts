import appNavigationController from '../../components/appNavigationController';

import {CURRENT_ACCOUNT_QUERY_PARAM} from './constants';
import {ActiveAccountNumber} from './types';

export function changeAccount(accountNumber: ActiveAccountNumber, newTab = false) {
  const url = new URL(location.href);

  if(accountNumber === 1) url.searchParams.delete(CURRENT_ACCOUNT_QUERY_PARAM);
  else url.searchParams.set(CURRENT_ACCOUNT_QUERY_PARAM, accountNumber + '');

  const newUrl = url.search ? url.pathname + url.search : url.pathname;
  if(newTab) {
    window.open(newUrl, '_blank');
  } else {
    appNavigationController.overrideHash();
    history.replaceState(null, '', newUrl);
    location.reload();
  }
}
