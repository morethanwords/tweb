import {getCurrentAccountFromURL} from '@lib/accounts/getCurrentAccountFromURL';
import {ActiveAccountNumber} from '@lib/accounts/types';

export const getCurrentAccount = (() => {
  let result: ActiveAccountNumber;
  return () => (result ??= getCurrentAccountFromURL(window.location.href));
})();
