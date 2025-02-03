import {getValidatedAccount} from './getValidatedAccount';
import {CURRENT_ACCOUNT_QUERY_PARAM} from './constants';

export function getCurrentAccountFromURL(urlString: string) {
  const params = new URL(urlString).searchParams;
  return getValidatedAccount(params.get(CURRENT_ACCOUNT_QUERY_PARAM) || '');
}
