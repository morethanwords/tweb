import {doubleRaf} from '../helpers/schedulers';
import pause from '../helpers/schedulers/pause';

import {getValidatedAccount} from '../lib/accounts/getValidatedAccount';
import {changeAccount} from '../lib/accounts/changeAccount';

import ButtonIcon from './buttonIcon';

export function AuthBackButton() {
  const button = ButtonIcon('back');
  button.addEventListener('click', async() => {
    localStorage.setItem('should-animate-main', 'true');
    const prevAccount = getValidatedAccount(localStorage.getItem('previous-account'));
    localStorage.removeItem('previous-account');

    const authPagesEl = document.getElementById('auth-pages');

    authPagesEl.classList.add('auth-pages-exit');
    await doubleRaf();
    authPagesEl.classList.add('auth-pages-exiting');
    await pause(200);

    changeAccount(prevAccount);
  });

  return button;
}
