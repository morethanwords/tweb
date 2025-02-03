import {getCurrentAccountFromURL} from './getCurrentAccountFromURL';
import {ActiveAccountNumber} from './types';

export const getCurrentAccount = (() => {
  let result: ActiveAccountNumber;
  return () => (result ??= getCurrentAccountFromURL(window.location.href));
})();
