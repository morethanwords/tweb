/*
 * https://github.com/morethanwords/tweb
 * Copyright (C) 2019-2021 Eduard Kuzmenko
 * https://github.com/morethanwords/tweb/blob/master/LICENSE
 * 
 * Originally from:
 * https://github.com/zhukov/webogram
 * Copyright (C) 2014 Igor Zhukov <igor.beatle@gmail.com>
 * https://github.com/zhukov/webogram/blob/master/LICENSE
 */

import type { AccountPassword, AccountUpdatePasswordSettings, InputCheckPasswordSRP, PasswordKdfAlgo } from '../../layer';
import { MOUNT_CLASS_TO } from '../../config/debug';
import apiManager from './mtprotoworker';
import randomize from '../../helpers/array/randomize';

export class PasswordManager {
  public getState(): Promise<AccountPassword> {
    return apiManager.invokeApi('account.getPassword').then((result) => {
      return result;
    });
  }

  public updateSettings(settings: {
    hint?: string,
    email?: string,
    newPassword?: string,
    currentPassword?: string
  } = {}) {
    //state = Object.assign({}, state);
    //state.new_algo = Object.assign({}, state.new_algo);

    return this.getState().then(state => {
      let currentHashPromise: Promise<InputCheckPasswordSRP>;
      let newHashPromise: Promise<Uint8Array>;
      const params: AccountUpdatePasswordSettings = {
        password: null,
        new_settings: {
          _: 'account.passwordInputSettings',
          hint: settings.hint,
          email: settings.email
        }
      };
  
      if(settings.currentPassword) {
        currentHashPromise = apiManager.invokeCrypto('computeSRP', settings.currentPassword, state, false) as any;
      } else {
        currentHashPromise = Promise.resolve({
          _: 'inputCheckPasswordEmpty'
        });
      }
  
      // * https://core.telegram.org/api/srp#setting-a-new-2fa-password, but still there is a mistake, TDesktop passes 'new_algo' everytime
      const newAlgo = state.new_algo as PasswordKdfAlgo.passwordKdfAlgoSHA256SHA256PBKDF2HMACSHA512iter100000SHA256ModPow;
      const salt1 = new Uint8Array(newAlgo.salt1.length + 32);
      randomize(salt1);
      salt1.set(newAlgo.salt1, 0);
      newAlgo.salt1 = salt1;
  
      if(settings.newPassword) {
        newHashPromise = apiManager.invokeCrypto('computeSRP', settings.newPassword, state, true) as any;
      } else {
        newHashPromise = Promise.resolve(new Uint8Array());
      }
  
      return Promise.all([currentHashPromise, newHashPromise]).then((hashes) => {
        params.password = hashes[0];
        params.new_settings.new_algo = newAlgo;
        params.new_settings.new_password_hash = hashes[1];
  
        return apiManager.invokeApi('account.updatePasswordSettings', params);
      });
    });
  }

  public check(password: string, state: AccountPassword, options: any = {}) {
    return apiManager.invokeCrypto('computeSRP', password, state, false).then((inputCheckPassword) => {
      //console.log('SRP', inputCheckPassword);
      return apiManager.invokeApi('auth.checkPassword', {
        password: inputCheckPassword as InputCheckPasswordSRP.inputCheckPasswordSRP
      }, options).then(auth => {
        if(auth._ === 'auth.authorization') {
          apiManager.setUser(auth.user);
        }

        return auth;
      });
    });
  }

  public confirmPasswordEmail(code: string) {
    return apiManager.invokeApi('account.confirmPasswordEmail', {code});
  }

  public resendPasswordEmail() {
    return apiManager.invokeApi('account.resendPasswordEmail');
  }

  public cancelPasswordEmail() {
    return apiManager.invokeApi('account.cancelPasswordEmail');
  }

  /* public requestRecovery(options: any = {}) {
    return apiManager.invokeApi('auth.requestPasswordRecovery', {}, options);
  }

  public recover(code: any, options: any = {}) {
    return apiManager.invokeApi('auth.recoverPassword', {
      code
    }, options);
  } */
}

const passwordManager = new PasswordManager();
MOUNT_CLASS_TO.passwordManager = passwordManager;
export default passwordManager;
