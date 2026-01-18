import {getValidatedAccount} from '@lib/accounts/getValidatedAccount';
import {CURRENT_ACCOUNT_QUERY_PARAM} from '@lib/accounts/constants';

export function getCurrentAccountFromURL(urlString: string) {
  const params = new URL(urlString).searchParams;
  return getValidatedAccount(params.get(CURRENT_ACCOUNT_QUERY_PARAM) || '');
}
