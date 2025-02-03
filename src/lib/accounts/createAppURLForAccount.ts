import {CURRENT_ACCOUNT_QUERY_PARAM} from './constants';
import {ActiveAccountNumber} from './types';

export function createAppURLForAccount(
  accountNumber: ActiveAccountNumber,
  hashParams?: Record<string, string>,
  keepHash = false
) {
  const url = new URL(location.href);

  const filteredEntries = Object.entries(hashParams || {}).filter((entry) => entry[1]);
  const filteredParams = Object.fromEntries(filteredEntries);

  if(filteredEntries.length) {
    const hashSearchParams = new URLSearchParams();
    for(const key in filteredParams) {
      hashSearchParams.set(key, filteredParams[key]);
    }
    url.hash = `#/im?${hashSearchParams.toString()}`;
  } else if(!keepHash) {
    url.hash = '';
  }

  if(accountNumber === 1) url.searchParams.delete(CURRENT_ACCOUNT_QUERY_PARAM);
  else url.searchParams.set(CURRENT_ACCOUNT_QUERY_PARAM, accountNumber + '');

  return url;
}
