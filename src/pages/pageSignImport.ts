/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {putPreloader} from '../components/putPreloader';
import App from '../config/app';
import {STATE_INIT} from '../config/state';
import rootScope from '../lib/rootScope';
import {AuthState} from '../types';
import Page from './page';

let data: AuthState.signImport['data'];

const importWebToken = async() => {
  const {dcId, token, tgAddr} = data;
  let mountPageAfter: Promise<{default: Page}>;
  try {
    rootScope.managers.apiManager.setBaseDcId(dcId);
    const authorization = await rootScope.managers.apiManager.invokeApi('auth.importWebTokenAuthorization', {
      api_id: App.id,
      api_hash: App.hash,
      web_auth_token: token
    }, {dcId, ignoreErrors: true});

    if(authorization._ === 'auth.authorization') {
      await rootScope.managers.apiManager.setUser(authorization.user);
      mountPageAfter = import('./pageIm');
      // return;
    }
  } catch(err) {
    switch((err as ApiError).type) {
      case 'SESSION_PASSWORD_NEEDED': {
        mountPageAfter = import('./pagePassword');
        break;
      }

      default: {
        console.error('authorization import error:', err);
        const defaultState = STATE_INIT.authState._;
        if(defaultState === 'authStateSignIn') mountPageAfter = import('./pageSignIn');
        else if(defaultState === 'authStateSignQr') mountPageAfter = import('./pageSignQR');
        break;
      }
    }
  }

  location.hash = tgAddr?.trim() ? '#?tgaddr=' + encodeURIComponent(tgAddr) : '';
  if(mountPageAfter) {
    mountPageAfter.then((m) => m.default.mount());
  }
};

const page = new Page('page-signImport', true, () => {
  putPreloader(page.pageEl.firstElementChild, true);
  importWebToken();
}, (_data: typeof data) => {
  data = _data;
  rootScope.managers.appStateManager.pushToState('authState', {_: 'authStateSignImport', data});
});

export default page;
