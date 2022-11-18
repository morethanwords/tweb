/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 */

import {putPreloader} from '../components/putPreloader';
import App from '../config/app';
import rootScope from '../lib/rootScope';
import {AuthState} from '../types';
import Page from './page';

let data: AuthState.signImport['data'];

const onFirstMount = async() => {
  putPreloader(page.pageEl.firstElementChild, true);

  const {dcId, token, tgAddr} = data;
  let mountPageAfter: Promise<Page>;
  try {
    rootScope.managers.apiManager.setBaseDcId(dcId);
    const authorization = await rootScope.managers.apiManager.invokeApi('auth.importWebTokenAuthorization', {
      api_id: App.id,
      api_hash: App.hash,
      web_auth_token: token
    }, {dcId, ignoreErrors: true});

    if(authorization._ === 'auth.authorization') {
      rootScope.managers.apiManager.setUser(authorization.user);
      mountPageAfter = import('./pageIm').then((m) => m.default);
      // return;
    }
  } catch(err) {
    switch((err as ApiError).type) {
      case 'SESSION_PASSWORD_NEEDED':
        (err as ApiError).handled = true;
        mountPageAfter = import('./pagePassword').then((m) => m.default);
        break;
      default:
        console.error('authorization import error:', err);
        break;
    }
  }

  location.hash = tgAddr?.trim() ? '#?tgaddr=' + encodeURIComponent(tgAddr) : '';
  if(mountPageAfter) {
    mountPageAfter.then((page) => page.mount());
  }
};

const page = new Page('page-signImport', true, onFirstMount, (_data: typeof data) => {
  data = _data;
  rootScope.managers.appStateManager.pushToState('authState', {_: 'authStateSignImport', data});
});

export default page;
