import {doubleRaf} from '../helpers/schedulers';
import pause from '../helpers/schedulers/pause';

import {getValidatedAccount} from '../lib/accounts/getValidatedAccount';
import {changeAccount} from '../lib/accounts/changeAccount';

import ButtonIcon from './buttonIcon';
import sessionStorage from '../lib/sessionStorage';

export function AuthBackButton() {
  const button = ButtonIcon('back');
  button.addEventListener('click', async() => {
    await sessionStorage.set({should_animate_main: 1});
    const prevAccount = getValidatedAccount(await sessionStorage.get('previous_account'));
    await sessionStorage.delete('previous_account');

    const authPagesEl = document.getElementById('auth-pages');

    authPagesEl.classList.add('auth-pages-exit');
    await doubleRaf();
    authPagesEl.classList.add('auth-pages-exiting');
    await pause(200);

    changeAccount(prevAccount);
  });

  return button;
}
